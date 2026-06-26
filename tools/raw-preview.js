/**
 * raw-preview.js v10 — 从 RAW/DNG 文件中提取内嵌 JPEG 预览图
 * 支持：CR2, NEF, ARW, DNG, ORF, RW2, RAF, CR3
 *
 * v10 重写：
 *   1. 正确解析 TIFF IFD0 → IFD1 链，读取 IFD1 中 Tag 0x201/0x202（EXIF 缩略图）
 *   2. 支持 DNG JPEG 压缩模式（Tag 0x103=6，从 StripOffsets 读取数据）
 *   3. 正确查找 JPEG EOI（处理扫描数据中的 0xFF 0x00 转义）
 *   4. 提取后验证：用 Image 对象加载，失败时自动尝试下一个候选
 *   5. 调试信息输出到 window._rawDebug 数组，页面可读取显示
 *
 * 使用：RawPreview.extract(file, callback)
 * 开启调试：RawPreview.DEBUG = true
 */
var RawPreview = (function () {
  'use strict';

  /* ====== 配置 ====== */
  var MAX_SIZE      = 500 * 1024 * 1024; // 500MB
  var MIN_JPEG_SIZE = 5 * 1024;          // 5KB 最小
  var MAX_JPEG_SIZE = 200 * 1024 * 1024; // 200MB 最大
  var MIN_WIDTH     = 800;                // 过滤缩略图
  var DEBUG         = true;                // 默认开启，方便页面显示调试信息

  /* ====== 调试 ====== */
  function log(msg) {
    if (!DEBUG) return;
    var tag = '[RawPreview] ' + msg;
    console.log(tag);
    // 存入全局数组，页面可读取
    if (typeof window !== 'undefined') {
      if (!window._rawDebug) window._rawDebug = [];
      window._rawDebug.push(msg);
      if (window._rawDebug.length > 200) window._rawDebug.shift();
      // 如果页面有 showDebug 函数，直接调用（实时显示）
      if (typeof window.showRawDebug === 'function') {
        window.showRawDebug(msg);
      }
    }
  }

  /* ====== 二进制读取 ====== */
  function u16(buf, off, le) {
    if (off + 1 >= buf.length) return 0;
    return le ? (buf[off] | (buf[off + 1] << 8))
              : ((buf[off] << 8) | buf[off + 1]);
  }
  function u32(buf, off, le) {
    if (off + 3 >= buf.length) return 0;
    if (le) {
      return ((buf[off]) | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0;
    }
    return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
  }

  /* ====== JPEG 尺寸（读 SOF 标记，不解码） ====== */
  function jpegDims(buf, start) {
    try {
      if (start + 2 > buf.length) return null;
      if (buf[start] !== 0xFF || buf[start + 1] !== 0xD8) return null;
      var pos = start + 2;
      while (pos < buf.length - 1) {
        if (buf[pos] !== 0xFF) { pos++; continue; }
        while (pos < buf.length && buf[pos] === 0xFF) pos++;
        if (pos >= buf.length) break;
        var m = buf[pos]; pos++;
        // SOF0–SOF2：帧头部格式为 [精度1][高度2][宽度2]
        if (m >= 0xC0 && m <= 0xC2) {
          if (pos + 6 < buf.length) {
            var h = (buf[pos + 1] << 8) | buf[pos + 2];
            var w = (buf[pos + 3] << 8) | buf[pos + 4];
            return { w: w, h: h };
          }
        }
        if (m === 0xD9 || m === 0xDA) break;
        if (pos + 1 >= buf.length) break;
        var len = (buf[pos] << 8) | buf[pos + 1];
        if (len < 2) break;
        pos += len;
      }
    } catch (e) { log('jpegDims 错误: ' + e.message); }
    return null;
  }

  /* ====== 正确查找 JPEG EOI（处理扫描数据转义） ====== */
  function findEoi(buf, start) {
    if (start + 2 > buf.length) return -1;
    if (buf[start] !== 0xFF || buf[start + 1] !== 0xD8) return -1;
    var pos = start + 2;
    var inScan = false;
    while (pos < buf.length) {
      if (!inScan) {
        if (buf[pos] !== 0xFF) { pos++; continue; }
        while (pos < buf.length && buf[pos] === 0xFF) pos++;
        if (pos >= buf.length) break;
        var m = buf[pos]; pos++;
        if (m === 0xD9) return pos;           // EOI
        if (m >= 0xD0 && m <= 0xD7) continue; // RST
        if (m === 0xDA) { inScan = true; continue; } // SOS → 进入扫描数据
        if (m === 0x00) continue;
        if (pos + 1 >= buf.length) break;
        var len = (buf[pos] << 8) | buf[pos + 1];
        if (len < 2) break;
        pos += len;
      } else {
        // 扫描数据中：0xFF 0x00 = 转义，0xFF 0xD9 = 真正 EOI
        if (buf[pos] === 0xFF) {
          if (pos + 1 < buf.length) {
            if (buf[pos + 1] === 0x00) { pos += 2; continue; }
            if (buf[pos + 1] === 0xD9) return pos + 2;
            pos++; // 其他标记 → 退出扫描数据
          }
        } else pos++;
      }
    }
    return -1;
  }

  /* ====== TIFF/DNG IFD 解析 ====== */
  /**
   * 递归解析 IFD
   * @param {Uint8Array} buf
   * @param {number[]} results  - 输出候选列表
   * @param {number[]} visited  - 防循环
   * @param {number} off        - 当前 IFD 偏移量
   * @param {number} depth
   * @param {boolean} le       - 字节序
   */
  function walkIfd(buf, results, visited, off, depth, le) {
    if (depth > 25 || off < 0 || off >= buf.length - 2) return;
    if (visited.indexOf(off) >= 0) return;
    visited.push(off);

    if (off + 2 > buf.length) return;
    var n = u16(buf, off, le);
    if (n > 2000 || n === 0) return;

    // 当前 IFD 收集的信息
    var jpegOff = 0, jpegLen = 0;       // Tag 0x201 / 0x202
    var compression = 0;                   // Tag 0x103
    var stripOffs = [], stripLens = [];   // Tag 0x111 / 0x117
    var subIfdOffs = [];                  // Tag 0x14A

    for (var i = 0; i < n; i++) {
      var e = off + 2 + i * 12;
      if (e + 12 > buf.length) break;
      var tag = u16(buf, e, le);
      var type = u16(buf, e + 2, le);
      var cnt = u32(buf, e + 4, le);
      var v   = u32(buf, e + 8, le);   // 内联值或偏移量

      if (tag === 0x0103) compression = v;    // Compression
      if (tag === 0x0201 && v > 0) jpegOff = v;
      if (tag === 0x0202 && v > 0) jpegLen = v;

      // StripOffsets（Tag 0x111）和 StripByteCounts（Tag 0x117）
      if (tag === 0x0111 || tag === 0x0117) {
        var isOff = (tag === 0x0111);
        var arr = isOff ? stripOffs : stripLens;
        if (cnt === 1) {
          arr.push(v);
        } else if (type === 4 || type === 3) {
          // 值存在别的位置：v 是偏移量
          var step = (type === 3) ? 2 : 4;
          var maxK = Math.min(cnt, 100);
          for (var k = 0; k < maxK; k++) {
            var a = v + k * step;
            if (a + step <= buf.length) {
              arr.push(step === 2 ? u16(buf, a, le) : u32(buf, a, le));
            }
          }
        }
      }

      // SubIFDs（Tag 0x14A）
      if (tag === 0x014A && type === 4) {
        for (var k = 0; k < Math.min(cnt, 10); k++) {
          var a = v + k * 4;
          if (a + 4 <= buf.length) subIfdOffs.push(u32(buf, a, le));
        }
      }
    }

    /* --- 候选1：EXIF 缩略图（IFD1 中 Tag 0x201/0x202）--- */
    if (jpegOff > 0 && jpegLen > 0 && jpegOff + jpegLen <= buf.length) {
      if (buf[jpegOff] === 0xFF && buf[jpegOff + 1] === 0xD8) {
        var d = jpegDims(buf, jpegOff);
        // 尺寸足够大才要（避免只要 160×120 缩略图）
        if (!d || d.w >= MIN_WIDTH) {
          results.push({ s: jpegOff, e: jpegOff + jpegLen,
                        size: jpegLen, src: 'EXIF', w: d ? d.w : 0, h: d ? d.h : 0 });
          log('IFD 缩略图: 偏移=' + jpegOff + ' 长度=' + jpegLen +
               (d ? (' ' + d.w + '×' + d.h) : ''));
        }
      }
    }

    /* --- 候选2：JPEG 压缩的 DNG Strip（Compression=6）--- */
    if (compression === 6) {
      var pairs = Math.min(stripOffs.length, stripLens.length);
      for (var s = 0; s < pairs; s++) {
        var so = stripOffs[s], sl = stripLens[s];
        if (so > 0 && sl > 0 && so + sl <= buf.length &&
            buf[so] === 0xFF && buf[so + 1] === 0xD8) {
          var d = jpegDims(buf, so);
          results.push({ s: so, e: so + sl,
                        size: sl, src: 'DNG_JPEG', w: d ? d.w : 0, h: d ? d.h : 0 });
          log('DNG JPEG Strip: 偏移=' + so + ' 长度=' + sl +
               (d ? (' ' + d.w + '×' + d.h) : ''));
        }
      }
    }

    /* --- 递归：下一个 IFD（IFD0 → IFD1 → ...）--- */
    var nextOff = off + 2 + n * 12;
    if (nextOff + 4 <= buf.length) {
      var nxt = u32(buf, nextOff, le);
      if (nxt > 0 && nxt < buf.length) walkIfd(buf, results, visited, nxt, depth + 1, le);
    }
    /* --- 递归：SubIFDs --- */
    subIfdOffs.forEach(function (sub) {
      if (sub > 0 && sub < buf.length) walkIfd(buf, results, visited, sub, depth + 1, le);
    });
  }

  /* ====== 后备：扫描整个文件找 JPEG SOI ====== */
  function scanJpeg(buf) {
    var out = [];
    var lim = Math.min(buf.length, 150 * 1024 * 1024);
    for (var i = 0; i < lim - 1; i++) {
      if (buf[i] === 0xFF && buf[i + 1] === 0xD8) {
        var d = jpegDims(buf, i);
        if (d && d.w >= MIN_WIDTH) {
          var e = findEoi(buf, i);
          if (e > i) {
            out.push({ s: i, e: e, size: e - i, src: 'SCAN', w: d.w, h: d.h });
            log('扫描发现 JPEG: 偏移=' + i + ' 长度=' + (e - i) + ' ' + d.w + '×' + d.h);
            i = e - 1;
          }
        }
      }
    }
    return out;
  }

  /* ====== 主入口 ====== */
  function extract(file, cb) {
    if (file.size > MAX_SIZE) {
      cb(new Error('文件太大（' + (file.size / 1024 / 1024).toFixed(1) + 'MB），已超过 500MB 上限。'));
      return;
    }

    var reader = new FileReader();
    reader.onload = function (ev) {
      var buf = new Uint8Array(ev.target.result);
      window._rawDebug = []; // 清空调试日志
      log('=== 开始解析: ' + file.name + '（' + buf.length + ' 字节）===');

      var all = [];

      /* --- 方法1：TIFF/DNG 结构解析 --- */
      try {
        var le = (buf[0] === 0x49 && buf[1] === 0x49);
        var magic = u16(buf, 2, le);
        if (magic === 42 || magic === 43) {
          var first = u32(buf, 4, le);
          log('TIFF 检测成功，Magic=' + magic + '，首个 IFD 偏移=' + first);
          walkIfd(buf, all, [], first, 0, le);
          log('TIFF 解析完成，找到 ' + all.length + ' 个候选');
        } else {
          log('不是有效 TIFF（Magic=' + magic + '），跳过方法1');
        }
      } catch (ex) { log('方法1 异常: ' + ex.message); }

      /* --- 方法2：全文件 JPEG 扫描（后备）--- */
      if (all.length === 0) {
        try {
          var scanned = scanJpeg(buf);
          scanned.forEach(function (r) { all.push(r); });
          log('方法2（扫描）找到 ' + scanned.length + ' 个候选');
        } catch (ex) { log('方法2 异常: ' + ex.message); }
      }

      /* --- 去重 & 排序（优先大尺寸）--- */
      var uniq = [];
      all.forEach(function (r) {
        var dup = uniq.some(function (u) {
          return Math.abs(u.s - r.s) < 200 || (u.w === r.w && u.h === r.h && Math.abs(u.size - r.size) < 5000);
        });
        if (!dup) uniq.push(r);
      });
      uniq.sort(function (a, b) { return (b.w || 0) - (a.w || 0); });
      all = uniq;

      log('=== 共 ' + all.length + ' 个唯一候选，最大尺寸=' +
           (all[0] ? (all[0].w + '×' + all[0].h + ' [' + all[0].src + ']') : '无') + ' ===');

      if (all.length === 0) {
        var ext = file.name.substring(file.name.lastIndexOf('.'));
        cb(new Error(
          '⚠️ 无法从 ' + ext.toUpperCase() + ' 文件中提取预览图\n\n' +
          '文件: ' + file.name + '\n' +
          '大小: ' + (file.size / 1024 / 1024).toFixed(2) + ' MB\n\n' +
          '建议：用相机官方软件将照片导出为 JPG 格式后再上传。'
        ));
        return;
      }

      /* --- 依次尝试每个候选，直到有一个能成功加载 --- */
      var idx = 0;
      function tryNext() {
        if (idx >= all.length) {
          cb(new Error('已尝试 ' + idx + ' 个候选，均无法加载为有效图片。'));
          return;
        }
        var r = all[idx];
        log('尝试候选 ' + (idx + 1) + '/' + all.length + ': ' + r.src +
             ' 偏移=' + r.s + ' 长度=' + r.size + ' ' + r.w + '×' + r.h);
        var data = buf.slice(r.s, r.e);
        // 确保有 EOI
        if (data.length < 2 || data[data.length - 2] !== 0xFF || data[data.length - 1] !== 0xD9) {
          log('  尾部不完整，自动修补 EOI');
          var tmp = new Uint8Array(data.length + 2);
          tmp.set(data);
          tmp[tmp.length - 2] = 0xFF;
          tmp[tmp.length - 1] = 0xD9;
          data = tmp;
        }
        var blob = new Blob([data], { type: 'image/jpeg' });
        var url = URL.createObjectURL(blob);
        var img = new Image();
        img.onload = function () {
          log('  ✅ 加载成功: ' + img.naturalWidth + '×' + img.naturalHeight);
          cb(null, {
            blob: blob,
            url: url,
            size: data.length,
            width: img.naturalWidth,
            height: img.naturalHeight,
            source: r.src
          });
        };
        img.onerror = function () {
          log('  ❌ 加载失败，尝试下一个候选');
          URL.revokeObjectURL(url);
          idx++;
          tryNext();
        };
        img.src = url;
      }
      tryNext();
    };
    reader.onerror = function () { cb(new Error('读取文件失败')); };
    reader.readAsArrayBuffer(file);
  }

  return { extract: extract, DEBUG: DEBUG };
})();
