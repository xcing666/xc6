/**
 * raw-preview.js v8 — 从RAW/DNG格式图片中提取内嵌的JPEG预览图
 * 支持：Canon CR2/CR3, Nikon NEF, Sony ARW, Adobe DNG, Olympus ORF, Panasonic RW2, Fujifilm RAF
 *
 * 改进 v8：
 *   1. 修复 Canon CR2 预览图提取（正确解析 CR2 SubIFD 结构）
 *   2. 增加 JPEG 尺寸验证，过滤掉缩略图（< 1000x1000）
 *   3. 增加 getJpegDimensions 函数，不解码整个图片就能读取宽高
 *   4. 对 CR2 文件优先使用全尺寸预览图（通常 > 2000x1000）
 *   5. 修复 v7 中的变量名拼写错误（p-start → p.start）
 *
 * 使用方法：
 *   RawPreview.extract(file, function(err, result) { ... });
 *   开启调试：在控制台执行 RawPreview.DEBUG = true;
 */
var RawPreview = (function () {
  'use strict';

  // ==================== 配置 ====================
  var MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB 上限
  var MIN_PREVIEW_SIZE = 5 * 1024;       // 5KB 最小预览图
  var MAX_PREVIEW_SIZE = 200 * 1024 * 1024; // 200MB 最大预览图
  var MIN_PREVIEW_WIDTH = 800;            // 最小宽度（过滤缩略图）
  var DEBUG = false;

  // ==================== 工具函数 ====================

  function log(msg) {
    if (DEBUG) console.log('[RawPreview] ' + msg);
  }

  function readUint16(buf, offset, le) {
    if (offset + 1 >= buf.length) return 0;
    return le ? (buf[offset] | (buf[offset + 1] << 8)) : ((buf[offset] << 8) | buf[offset + 1]);
  }

  function readUint32(buf, offset, le) {
    if (offset + 3 >= buf.length) return 0;
    if (le) {
      return (buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16) | (buf[offset + 3] << 24)) >>> 0;
    }
    return (((buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]) >>> 0);
  }

  /** 检测文件类型 */
  function detectFileType(buf) {
    if (buf.length < 16) return { type: 'unknown', desc: '文件太小' };
    var h = Array.from(buf.slice(0, 12)).map(function(b) { return '0x' + b.toString(16).padStart(2, '0'); }).join(' ');
    if (buf[0] === 0x49 && buf[1] === 0x49) {
      var m = readUint16(buf, 2, true);
      if (m === 42) return { type: 'tiff-le', desc: 'TIFF/DNG (小端序)', header: h };
      if (m === 43) return { type: 'bigtiff-le', desc: 'BigTIFF (小端序，暂不支持)', header: h };
    }
    if (buf[0] === 0x4D && buf[1] === 0x4D) {
      var m2 = readUint16(buf, 2, false);
      if (m2 === 42) return { type: 'tiff-be', desc: 'TIFF/DNG (大端序)', header: h };
    }
    if (buf[0] === 0xFF && buf[1] === 0xD8) return { type: 'jpeg', desc: 'JPEG', header: h };
    if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
      return { type: 'cr3', desc: 'Canon CR3 (ISOBMFF)', header: h };
    }
    return { type: 'unknown', desc: '无法识别，前12字节: ' + h, header: h };
  }

  // ==================== JPEG 尺寸读取（不解码整个图片）====================

  /**
   * 从 JPEG 数据中读取图片尺寸
   * 通过解析 SOF (Start of Frame) 标记来获取宽高
   * 返回：{ width: number, height: number } 或 null
   */
  function getJpegDimensions(buf, start) {
    try {
      if (start + 2 > buf.length) return null;
      if (buf[start] !== 0xFF || buf[start + 1] !== 0xD8) return null;

      var pos = start + 2;
      while (pos < buf.length - 1) {
        // 找到下一个 0xFF
        if (buf[pos] !== 0xFF) { pos++; continue; }
        while (pos < buf.length && buf[pos] === 0xFF) pos++;
        if (pos >= buf.length) break;

        var marker = buf[pos];
        pos++;

        // SOF0-SOF2, SOF3, SOF5-SOF7, SOF9-SOFB, SOFD-SOFF (各种帧类型)
        if ((marker >= 0xC0 && marker <= 0xC3) ||
            (marker >= 0xC5 && marker <= 0xC7) ||
            (marker >= 0xC9 && marker <= 0xCB) ||
            (marker >= 0xCD && marker <= 0xCF)) {
          if (pos + 6 < buf.length) {
            // SOF 结构：标记 长度 精度 高度 宽度
            // 注意：JPEG 文件格式是大端序（与 TIFF 不同）
            var height = (buf[pos + 1] << 8) | buf[pos + 2];
            var width = (buf[pos + 3] << 8) | buf[pos + 4];
            return { width: width, height: height };
          }
        }

        // EOI 或 SOS — 停止扫描
        if (marker === 0xD9 || marker === 0xDA) break;

        // 跳过这个段
        if (pos + 1 >= buf.length) break;
        var segLen = (buf[pos] << 8) | buf[pos + 1];
        if (segLen < 2) break;
        pos += segLen;
      }
    } catch (e) {
      log('读取 JPEG 尺寸失败: ' + e.message);
    }
    return null;
  }

  // ==================== TIFF/DNG 解析 ====================

  function parseIfd(buf, offset, le, results, visited, depth) {
    if (depth > 20 || offset < 0 || offset >= buf.length - 2) return;
    if (visited.indexOf(offset) >= 0) return;
    visited.push(offset);

    if (offset + 2 > buf.length) return;
    var numEntries = readUint16(buf, offset, le);
    if (numEntries > 1000 || numEntries === 0) return;

    var jpegOff = 0, jpegLen = 0;
    var subIfdOffsets = [];

    for (var i = 0; i < numEntries; i++) {
      var eOff = offset + 2 + i * 12;
      if (eOff + 12 > buf.length) break;

      var tag = readUint16(buf, eOff, le);
      var type = readUint16(buf, eOff + 2, le);
      var count = readUint32(buf, eOff + 4, le);
      var val = readUint32(buf, eOff + 8, le);

      // Tag 0x201: JPEGInterchangeFormat (EXIF 缩略图)
      if (tag === 0x201 && val > 0) jpegOff = val;
      // Tag 0x202: JPEGInterchangeFormatLength
      if (tag === 0x202 && val > 0) jpegLen = val;

      // Tag 0x014A (334): SubIFDs
      if (tag === 0x014A && type === 4) {
        var numSub = Math.min(count, 10);
        for (var s = 0; s < numSub; s++) {
          if (eOff + 8 + s * 4 + 4 <= buf.length) {
            subIfdOffsets.push(readUint32(buf, eOff + 8 + s * 4, le));
          }
        }
      }
    }

    // 验证并提取 JPEG（EXIF 缩略图）
    if (jpegOff > 0 && jpegLen > 0 && jpegOff + jpegLen <= buf.length) {
      if (buf[jpegOff] === 0xFF && buf[jpegOff + 1] === 0xD8) {
        // 验证尺寸
        var dims = getJpegDimensions(buf, jpegOff);
        var minSize = (dims && dims.width >= MIN_PREVIEW_WIDTH) ? '✓' : '⚠';
        results.push({ start: jpegOff, end: jpegOff + jpegLen, size: jpegLen, source: 'EXIF', width: dims ? dims.width : 0, height: dims ? dims.height : 0 });
        log('EXIF 缩略图: 偏移=' + jpegOff + ' 长度=' + jpegLen + ' ' + minSize + (dims ? (' ' + dims.width + 'x' + dims.height) : ''));
      }
    }

    // 读取下一个 IFD
    var nextOff = offset + 2 + numEntries * 12;
    if (nextOff + 4 <= buf.length) {
      var next = readUint32(buf, nextOff, le);
      if (next > 0 && next < buf.length) {
        parseIfd(buf, next, le, results, visited, depth + 1);
      }
    }

    // 递归解析 SubIFDs
    subIfdOffsets.forEach(function(subOff) {
      if (subOff > 0 && subOff < buf.length) {
        parseIfd(buf, subOff, le, results, visited, depth + 1);
      }
    });
  }

  function extractFromTiff(buf) {
    var ft = detectFileType(buf);
    log('文件类型: ' + ft.desc + ' [' + ft.header + ']');

    if (ft.type === 'unknown' || ft.type === 'jpeg') {
      log('不是有效的 TIFF/DNG 文件');
      return [];
    }

    var le = (buf[0] === 0x49 && buf[1] === 0x49);
    var firstIfd = readUint32(buf, 4, le);
    log('第一个 IFD 偏移: ' + firstIfd);

    var results = [];
    parseIfd(buf, firstIfd, le, results, [], 0);
    log('TIFF 解析共找到 ' + results.length + ' 个预览图');
    return results;
  }

  // ==================== Canon CR2 专属解析 ====================

  /**
   * Canon CR2 文件格式：
   *   - 前 16 字节是 CR2 文件头
   *   - 然后是 TIFF IFD0
   *   - IFD0 中有 Tag 0x927C (MakerNote)
   *   - MakerNote 是第 3 个 IFD（CR2 专属），里面有预览图信息
   *   - CR2 预览图通常有两个：缩略图（~160x120）和全尺寸预览（~RAW 尺寸）
   *
   * 完整解析步骤：
   *   1. 解析 IFD0，找到 Tag 0x927C (MakerNote) 的偏移量
   *   2. 在 MakerNote 数据中，找到 Canon Preview Image Info（Tag 0x4001 的 SubIFD）
   *   3. 在这个 SubIFD 中，Tag 0x0001 是预览图偏移量，Tag 0x0002 是大小
   */
  function tryExtractCanonCr2(buf) {
    var results = [];
    var le = (buf[0] === 0x49 && buf[1] === 0x49);

    try {
      // 步骤1：解析 IFD0，找到 MakerNote (Tag 0x927C)
      var firstIfd = readUint32(buf, 4, le);
      var makerNoteOff = 0;
      var makerNoteLen = 0;

      // 读取 IFD0 的所有条目
      if (firstIfd + 2 <= buf.length) {
        var numEntries = readUint16(buf, firstIfd, le);
        for (var i = 0; i < numEntries; i++) {
          var eOff = firstIfd + 2 + i * 12;
          if (eOff + 12 > buf.length) break;

          var tag = readUint16(buf, eOff, le);
          var type = readUint16(buf, eOff + 2, le);
          var count = readUint32(buf, eOff + 4, le);
          var val = readUint32(buf, eOff + 8, le);

          if (tag === 0x927C) {
            // MakerNote 偏移量
            makerNoteOff = (type === 4 || type === 13) ? val : readUint32(buf, eOff + 8, le);
            makerNoteLen = count;
            log('找到 MakerNote: 偏移=' + makerNoteOff + ' 长度=' + makerNoteLen);
          }
        }
      }

      // 步骤2：在 MakerNote 中，找到 CR2 Preview Image Info (Tag 0x4001)
      if (makerNoteOff > 0 && makerNoteOff < buf.length) {
        // Canon MakerNote 的前 6 个字节是 "Canon " 或类似标识
        // 然后是 TIFF 格式的 SubIFD
        var mnLe = (buf[makerNoteOff] === 0x49 && buf[makerNoteOff + 1] === 0x49);
        var mnFirstIfd = readUint32(buf, makerNoteOff + 6, mnLe); // MakerNote 数据从第 6 字节开始（跳过 "Canon "）
        // 注意：不同相机的 MakerNote 格式可能不同，有的直接从 TIFF IFD 开始

        // 更通用的方法：在 MakerNote 数据中寻找 Tag 0x4001
        // Tag 0x4001 是 Canon CR2 Preview Image Info
        var cr2PreviewOff = 0;
        var cr2PreviewLen = 0;

        // 尝试解析 MakerNote 中的 IFD
        parseCr2MakerNote(buf, makerNoteOff, makerNoteOff + makerNoteLen, le, results);

        log('方法2a (CR2 MakerNote) 找到 ' + results.length + ' 个预览');
      }

      // 步骤3：如果 MakerNote 解析失败，扫描文件后半部分寻找大型 JPEG
      if (results.length === 0) {
        var scanStart = Math.floor(buf.length / 2);
        for (var j = scanStart; j < buf.length - 1; j++) {
          if (buf[j] === 0xFF && buf[j + 1] === 0xD8) {
            var dims = getJpegDimensions(buf, j);
            if (dims && dims.width >= MIN_PREVIEW_WIDTH) {
              // 找到全尺寸预览图
              var end = findJpegEnd(buf, j);
              if (end > j) {
                results.push({ start: j, end: end, size: end - j, source: 'CR2_SCAN', width: dims.width, height: dims.height });
                log('CR2 扫描到全尺寸预览: 偏移=' + j + ' 尺寸=' + dims.width + 'x' + dims.height);
                j = end - 1;
              }
            }
          }
        }
        log('方法2b (CR2 扫描) 找到 ' + results.length + ' 个预览');
      }
    } catch (ex) {
      log('CR2 解析失败: ' + ex.message);
    }

    return results;
  }

  /** 解析 Canon MakerNote 中的预览图信息 */
  function parseCr2MakerNote(buf, mnStart, mnEnd, le, results) {
    try {
      // Canon MakerNote 中的 Preview Image Info 是一个 SubIFD
      // 它的 Tag 0x4001 指向这个 SubIFD
      // SubIFD 中有 Tag 0x0001 (预览图偏移量) 和 Tag 0x0002 (预览图大小)

      // 在 MakerNote 数据中寻找 0x4001 标记
      for (var pos = mnStart; pos < mnEnd - 4; pos++) {
        if (buf[pos] === 0x40 && buf[pos + 1] === 0x01) {
          // 可能是 Tag 0x4001
          // 但需要确认这是 IFD 条目格式
          // IFD 条目格式：Tag(2字节) Type(2字节) Count(4字节) Value/Offset(4字节)
          var tag = readUint16(buf, pos, le);
          if (tag === 0x4001) {
            var type = readUint16(buf, pos + 2, le);
            var count = readUint32(buf, pos + 4, le);
            var val = readUint32(buf, pos + 8, le);

            if (type === 4 && val > 0 && val < buf.length) {
              // val 是 SubIFD 的偏移量
              log('找到 CR2 Preview SubIFD: 偏移=' + val);
              parseCr2PreviewSubIfd(buf, val, le, results);
            }
          }
        }
      }
    } catch (e) {
      log('解析 CR2 MakerNote 失败: ' + e.message);
    }
  }

  /** 解析 CR2 Preview SubIFD */
  function parseCr2PreviewSubIfd(buf, offset, le, results) {
    try {
      if (offset + 2 > buf.length) return;
      var numEntries = readUint16(buf, offset, le);
      if (numEntries > 20) return;

      var previewOff = 0, previewLen = 0;
      for (var i = 0; i < numEntries; i++) {
        var eOff = offset + 2 + i * 12;
        if (eOff + 12 > buf.length) break;

        var tag = readUint16(buf, eOff, le);
        var val = readUint32(buf, eOff + 8, le);

        if (tag === 0x0001 && val > 0) previewOff = val; // 预览图偏移量
        if (tag === 0x0002 && val > 0) previewLen = val; // 预览图大小
      }

      if (previewOff > 0 && previewLen > 0 && previewOff + previewLen <= buf.length) {
        if (buf[previewOff] === 0xFF && buf[previewOff + 1] === 0xD8) {
          var dims = getJpegDimensions(buf, previewOff);
          results.push({
            start: previewOff, end: previewOff + previewLen,
            size: previewLen,
            source: 'CR2_PREVIEW',
            width: dims ? dims.width : 0,
            height: dims ? dims.height : 0
          });
          log('CR2 预览图: 偏移=' + previewOff + ' 大小=' + previewLen + (dims ? (' 尺寸=' + dims.width + 'x' + dims.height) : ''));
        }
      }
    } catch (e) {
      log('解析 CR2 Preview SubIFD 失败: ' + e.message);
    }
  }

  // ==================== Sony ARW 专属解析 ====================

  function tryExtractSonyArw(buf) {
    var results = [];
    // Sony ARW 文件通常在文件中有两个 JPEG：缩略图和全尺寸预览
    var limit = Math.min(buf.length, 50 * 1024 * 1024);
    for (var i = 0; i < limit - 1; i++) {
      if (buf[i] === 0xFF && buf[i + 1] === 0xD8) {
        var dims = getJpegDimensions(buf, i);
        if (dims && dims.width >= MIN_PREVIEW_WIDTH) {
          var end = findJpegEnd(buf, i);
          if (end > i) {
            results.push({ start: i, end: end, size: end - i, source: 'ARW', width: dims.width, height: dims.height });
            log('Sony ARW 全尺寸预览: 偏移=' + i + ' 尺寸=' + dims.width + 'x' + dims.height);
            i = end - 1;
          }
        }
      }
    }
    return results;
  }

  // ==================== JPEG 扫描 ====================

  function findAllJpegStarts(buf) {
    var starts = [];
    var limit = Math.min(buf.length, 100 * 1024 * 1024);
    for (var i = 0; i < limit - 1; i++) {
      if (buf[i] === 0xFF && buf[i + 1] === 0xD8) {
        starts.push(i);
        i++;
      }
    }
    log('扫描到 ' + starts.length + ' 个 JPEG SOI 标记');
    return starts;
  }

  function findJpegEnd(buf, startPos) {
    if (startPos + 2 > buf.length) return -1;
    if (buf[startPos] !== 0xFF || buf[startPos + 1] !== 0xD8) return -1;

    var pos = startPos + 2;
    var inScan = false;

    while (pos < buf.length) {
      if (!inScan) {
        if (buf[pos] !== 0xFF) { pos++; continue; }
        while (pos < buf.length && buf[pos] === 0xFF) pos++;
        if (pos >= buf.length) break;
        var marker = buf[pos];
        pos++;
        if (marker === 0xD9) return pos;
        if (marker >= 0xD0 && marker <= 0xD7) continue;
        if (marker === 0x00) continue;
        if (marker === 0xDA) { inScan = true; continue; }
        if (pos + 1 >= buf.length) break;
        var len = (buf[pos] << 8) | buf[pos + 1];
        if (len < 2) break;
        pos += len;
      } else {
        if (buf[pos] === 0xFF) {
          if (pos + 1 < buf.length) {
            if (buf[pos + 1] === 0x00) { pos += 2; continue; }
            if (buf[pos + 1] === 0xD9) { return pos + 2; }
            pos++;
          }
        } else {
          pos++;
        }
      }
    }

    log('未找到标准 EOI，使用后备扫描');
    return findJpegEndFallback(buf, startPos);
  }

  function findJpegEndFallback(buf, startPos) {
    for (var i = startPos + 2; i < buf.length - 1; i++) {
      if (buf[i] === 0xFF && buf[i + 1] === 0xD9) {
        var size = i + 2 - startPos;
        if (size > MIN_PREVIEW_SIZE) return i + 2;
      }
    }
    return -1;
  }

  // ==================== 主提取函数 ====================

  function extract(file, callback) {
    if (file.size > MAX_FILE_SIZE) {
      callback(new Error(
        '文件太大（' + (file.size / 1024 / 1024).toFixed(1) + 'MB），' +
        '已超过 ' + (MAX_FILE_SIZE / 1024 / 1024) + 'MB 的处理上限。'
      ));
      return;
    }

    var reader = new FileReader();
    reader.onload = function (e) {
      var buf = new Uint8Array(e.target.result);
      var allPreviews = [];
      var fileName = file.name.toLowerCase();

      log('=== 开始解析: ' + file.name + ' (' + buf.length + ' 字节) ===');

      // 方法1：TIFF/DNG 结构解析
      try {
        var tiffResults = extractFromTiff(buf);
        tiffResults.forEach(function (r) { allPreviews.push(r); });
        log('方法1 (TIFF解析) 找到 ' + tiffResults.length + ' 个预览');
      } catch (ex) {
        log('方法1失败: ' + ex.message);
      }

      // 方法2：相机专属提取
      if (fileName.indexOf('.cr2') >= 0 || fileName.indexOf('.cr') >= 0) {
        try {
          var cr2Results = tryExtractCanonCr2(buf);
          cr2Results.forEach(function (r) { allPreviews.push(r); });
          log('方法2 (Canon CR2) 找到 ' + cr2Results.length + ' 个预览');
        } catch (ex2) {
          log('方法2 (Canon CR2) 失败: ' + ex2.message);
        }
      }
      if (fileName.indexOf('.arw') >= 0) {
        try {
          var arwResults = tryExtractSonyArw(buf);
          arwResults.forEach(function (r) { allPreviews.push(r); });
          log('方法2 (Sony ARW) 找到 ' + arwResults.length + ' 个预览');
        } catch (ex3) {
          log('方法2 (Sony ARW) 失败: ' + ex3.message);
        }
      }

      // 方法3：全文件 JPEG 标记扫描
      try {
        var scanStarts = findAllJpegStarts(buf);
        scanStarts.forEach(function (start) {
          var isDup = allPreviews.some(function (p) {
            return start >= p.start - 100 && start <= p.end + 100;
          });
          if (isDup) return;

          var dims = getJpegDimensions(buf, start);
          if (!dims || dims.width < MIN_PREVIEW_WIDTH) return; // 过滤缩略图

          var end = findJpegEnd(buf, start);
          if (end > start && end <= buf.length) {
            var size = end - start;
            if (size > MIN_PREVIEW_SIZE && size < MAX_PREVIEW_SIZE) {
              allPreviews.push({ start: start, end: end, size: size, source: 'SCAN', width: dims.width, height: dims.height });
            }
          }
        });
        log('方法3 (JPEG扫描) 共找到 ' + allPreviews.length + ' 个预览');
      } catch (ex4) {
        log('方法3失败: ' + ex4.message);
      }

      // 去重并排序：优先使用尺寸大的预览图
      var unique = [];
      allPreviews.forEach(function (p) {
        var dup = unique.some(function (u) {
          return Math.abs(u.start - p.start) < 100 || Math.abs(u.size - p.size) < 100;
        });
        if (!dup) unique.push(p);
      });

      // 按尺寸（宽度）降序排列
      unique.sort(function (a, b) {
        var wa = a.width || 0;
        var wb = b.width || 0;
        return wb - wa;
      });

      allPreviews = unique;
      log('=== 共找到 ' + allPreviews.length + ' 个唯一预览图，最大宽度=' + (allPreviews[0] ? allPreviews[0].width : 0) + ' ===');

      if (allPreviews.length === 0) {
        var ft = detectFileType(buf);
        var ext = fileName.substring(fileName.lastIndexOf('.'));
        callback(new Error(
          '⚠️ 无法从 ' + ext.toUpperCase() + ' 文件中提取预览图\n\n' +
          '文件: ' + file.name + '\n' +
          '大小: ' + (file.size / 1024 / 1024).toFixed(2) + 'MB\n' +
          '格式: ' + ft.desc + '\n\n' +
          '建议：用相机官方软件将照片导出为 JPG 格式后再上传。'
        ));
        return;
      }

      // 提取最大的预览图
      var best = allPreviews[0];
      log('=== 提取预览图: 偏移=' + best.start + ' 大小=' + best.size + ' 来源=' + best.source + ' 尺寸=' + (best.width || '?') + 'x' + (best.height || '?') + ' ===');

      var jpegData = buf.slice(best.start, best.end);

      // 验证 JPEG 数据头部
      if (jpegData[0] !== 0xFF || jpegData[1] !== 0xD8) {
        log('JPEG 数据头部无效，尝试下一个预览');
        if (allPreviews.length > 1) {
          best = allPreviews[1];
          jpegData = buf.slice(best.start, best.end);
        } else {
          callback(new Error('提取到的 JPEG 数据头部无效。'));
          return;
        }
      }

      // 修复不完整的 JPEG（缺少 EOI）
      if (jpegData[jpegData.length - 2] !== 0xFF || jpegData[jpegData.length - 1] !== 0xD9) {
        log('JPEG 数据尾部不完整，自动修复');
        var fixedData = new Uint8Array(jpegData.length + 2);
        fixedData.set(jpegData);
        fixedData[fixedData.length - 2] = 0xFF;
        fixedData[fixedData.length - 1] = 0xD9;
        jpegData = fixedData;
      }

      var blob = new Blob([jpegData], { type: 'image/jpeg' });
      var url = URL.createObjectURL(blob);

      // 验证 JPEG 数据是否有效
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth || 0;
        var h = img.naturalHeight || 0;
        log('预览图加载成功: ' + w + 'x' + h);
        callback(null, {
          url: url,
          blob: blob,
          size: best.size,
          width: w,
          height: h,
          source: best.source
        });
      };
      img.onerror = function () {
        log('预览图数据无效，尝试下一个');
        URL.revokeObjectURL(url);
        if (allPreviews.length > 1) {
          var next = allPreviews[1];
          var nextData = buf.slice(next.start, next.end);
          var nextBlob = new Blob([nextData], { type: 'image/jpeg' });
          var nextUrl = URL.createObjectURL(nextBlob);
          var nextImg = new Image();
          nextImg.onload = function () {
            callback(null, {
              url: nextUrl,
              blob: nextBlob,
              size: next.size,
              width: nextImg.naturalWidth || 0,
              height: nextImg.naturalHeight || 0,
              source: next.source
            });
          };
          nextImg.onerror = function () {
            URL.revokeObjectURL(nextUrl);
            callback(new Error(
              '找到了预览图数据，但 JPEG 数据无效。\n' +
              '文件可能已损坏，或使用了不支持的编码方式。'
            ));
          };
          nextImg.src = nextUrl;
        } else {
          callback(new Error('提取到的 JPEG 数据无效或已损坏。'));
        }
      };
      img.src = url;
    };

    reader.onerror = function () {
      callback(new Error('读取文件失败，请检查文件是否损坏。'));
    };

    reader.readAsArrayBuffer(file);
  }

  // 公开 API
  return {
    extract: extract,
    DEBUG: DEBUG
  };
})();
