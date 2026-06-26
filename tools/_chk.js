
(function(){
  var RAW_EXTS = ['.cr2','.nef','.arw','.dng','.orf','.rw2','.raf','.srw','.cr3'];
  function isRawFile(f) {
    var n = f.name.toLowerCase();
    return RAW_EXTS.some(function(ext){ return n.endsWith(ext); });
  }

  // ========== 色彩增强 ==========
  function applyColorEnhance(img, mode, adj) {
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    // 模式预设
    var presets = { brightness:0, contrast:0, saturation:0, temperature:0, tint:0 };
    switch(mode) {
      case 'vivid':
        presets.saturation = 25; presets.contrast = 15; presets.brightness = 5;
        break;
      case 'natural':
        presets.saturation = 10; presets.contrast = 5;
        break;
      case 'warm':
        presets.temperature = 20; presets.saturation = 10;
        break;
      case 'cool':
        presets.temperature = -20; presets.saturation = 5;
        break;
    }

    var br = (presets.brightness + adj.brightness) * 2.55;
    var co = (presets.contrast + adj.contrast) / 100 + 1;   // 0.5~1.5 → 0.5~1.5
    var sa = (presets.saturation + adj.saturation) / 100 + 1;
    var tp = (presets.temperature + adj.temperature) * 1.5;
    var tn = (presets.tint + adj.tint) * 1.2;

    var imgData = ctx.getImageData(0, 0, w, h);
    var data = imgData.data;
    for (var i = 0; i < data.length; i += 4) {
      var r = data[i], g = data[i+1], b = data[i+2];

      // 亮度
      if (br !== 0) { r += br; g += br; b += br; }

      // 对比度
      if (co !== 1) {
        r = (r - 127.5) * co + 127.5;
        g = (g - 127.5) * co + 127.5;
        b = (b - 127.5) * co + 127.5;
      }

      // 饱和度
      if (sa !== 1) {
        var gray = 0.2989*r + 0.5870*g + 0.1140*b;
        r = gray + sa * (r - gray);
        g = gray + sa * (g - gray);
        b = gray + sa * (b - gray);
      }

      // 色温
      if (tp !== 0) { r += tp; b -= tp; }

      // 色调
      if (tn !== 0) { g -= tn; r += tn*0.5; b += tn*0.5; }

      data[i]   = Math.max(0, Math.min(255, r));
      data[i+1] = Math.max(0, Math.min(255, g));
      data[i+2] = Math.max(0, Math.min(255, b));
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  // ========== DOM ==========
  var zone      = document.getElementById('uploadZone');
  var input     = document.getElementById('fileInput');
  var list      = document.getElementById('fileList');
  var btn       = document.getElementById('convertBtn');
  var area      = document.getElementById('resultArea');
  var grid      = document.getElementById('resultGrid');
  var qSlider   = document.getElementById('quality');
  var qVal      = document.getElementById('qVal');
  var rawNotice = document.getElementById('rawNotice');
  var rawOpts   = document.getElementById('rawOptions');
  var colorPanel= document.getElementById('colorPanel');
  var showCP    = document.getElementById('showColorPanel');
  var enhCb     = document.getElementById('colorEnhance');
  var resetBtn  = document.getElementById('resetColor');

  var files = [];
  var hasRaw = false;

  // 上传
  zone.addEventListener('click', function(e){ if(e.target.tagName!=='INPUT') input.click(); });
  input.addEventListener('change', function(){ addFiles(input.files); input.value=''; });
  zone.addEventListener('dragover', function(e){ e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', function(){ zone.classList.remove('drag-over'); });
  zone.addEventListener('drop', function(e){ e.preventDefault(); zone.classList.remove('drag-over'); addFiles(e.dataTransfer.files); });

  // 品质滑块
  qSlider.addEventListener('input', function(){ qVal.textContent = qSlider.value; });

  // 调色面板开关
  showCP.addEventListener('change', function(){ colorPanel.classList.toggle('show', this.checked); });

  // 色彩增强开关
  enhCb.addEventListener('change', function(){ if(hasRaw) rawOpts.classList.toggle('show', this.checked); });

  // 重置调色
  resetBtn.addEventListener('click', function(){
    ['adjBrightness','adjContrast','adjSaturation','adjTemperature','adjTint'].forEach(function(id){
      document.getElementById(id).value = 0;
      document.getElementById(id+'Val').textContent = '0';
    });
  });

  // 调色滑块实时显示数值
  ['adjBrightness','adjContrast','adjSaturation','adjTemperature','adjTint'].forEach(function(id){
    var el = document.getElementById(id);
    var valEl = document.getElementById(id+'Val');
    el.addEventListener('input', function(){ valEl.textContent = this.value; });
  });

  function getAdjustments() {
    return {
      brightness:   +document.getElementById('adjBrightness').value,
      contrast:     +document.getElementById('adjContrast').value,
      saturation:   +document.getElementById('adjSaturation').value,
      temperature:   +document.getElementById('adjTemperature').value,
      tint:         +document.getElementById('adjTint').value
    };
  }

  function addFiles(fileList) {
    var gotRaw = false;
    for (var i = 0; i < fileList.length; i++) {
      // 文件大小检查
      if (fileList[i].size > 200 * 1024 * 1024) {
        alert('⚠️ 文件 "' + fileList[i].name + '" 太大（' + (fileList[i].size / 1024 / 1024).toFixed(1) + 'MB），已超过 200MB 处理上限。\n建议：用相机官方软件将照片导出为 JPG 格式后再上传。');
        continue;
      }
      files.push(fileList[i]);
      if (isRawFile(fileList[i])) gotRaw = true;
    }
    if (gotRaw) {
      hasRaw = true;
      rawNotice.classList.add('show');
      if (enhCb.checked) rawOpts.classList.add('show');
    }
    renderList();
  }

  function renderList() {
    list.innerHTML = '';
    files.forEach(function(f, idx){
      var item = document.createElement('div');
      item.className = 'file-item';
      var isRaw = isRawFile(f);
      var thumbHtml = '';
      if (!isRaw) {
        var url = URL.createObjectURL(f);
        thumbHtml = '<img class="file-thumb" src="'+url+'" alt="" />';
      } else {
        thumbHtml = '<div class="file-thumb-placeholder">📸</div>';
      }
      var badge = isRaw ? '<span class="file-type-badge">RAW</span>' : '';
      item.innerHTML =
        thumbHtml +
        '<div class="file-info">' +
          '<div class="file-name">'+f.name+badge+'</div>' +
          '<div class="file-size">'+(f.size/1024).toFixed(1)+' KB · '+(isRaw?'RAW 格式':f.type||'未知格式')+'</div>' +
        '</div>' +
        '<button class="file-remove" data-idx="'+idx+'">✕</button>';
      list.appendChild(item);
    });
    btn.disabled = !files.length;

    // 删除
    list.querySelectorAll('.file-remove').forEach(function(b){
      b.addEventListener('click', function(){
        files.splice(+this.dataset.idx, 1);
        hasRaw = files.some(function(f){ return isRawFile(f); });
        if (!hasRaw) { rawNotice.classList.remove('show'); rawOpts.classList.remove('show'); }
        renderList();
      });
    });
  }

  // ========== 转换 ==========
  btn.addEventListener('click', function(){
    if (!files.length) return;
    btn.disabled = true;
    btn.textContent = '⏳ 处理中…';
    area.style.display = 'block';
    grid.innerHTML = '';

    var fmt       = document.getElementById('outFmt').value;
    var q         = parseFloat(qSlider.value);
    var ext       = fmt==='image/png'?'png':fmt==='image/jpeg'?'jpg':'webp';
    var useEnh    = enhCb.checked && hasRaw;
    var mode      = document.getElementById('enhanceMode').value;
    var adj       = getAdjustments();
    var done      = 0;
    var total     = files.length;

    function finishOne() {
      done++;
      if (done >= total) {
        btn.textContent = '✅ 转换完成';
        setTimeout(function(){ btn.textContent = '🔄 开始转换'; btn.disabled = false; }, 3000);
      }
    }

    function addResultCard(name, url, blob) {
      var sizeStr = blob ? (blob.size/1024).toFixed(1) + ' KB' : '';
      var card = document.createElement('div');
      card.className = 'result-item';
      card.innerHTML =
        '<img class="result-thumb" src="'+url+'" alt="" />' +
        '<div class="result-info">' +
          '<div class="result-name">'+name+'</div>' +
          '<div class="result-size">'+sizeStr+'</div>' +
          '<a class="result-download" href="'+url+'" download="'+name+'">⬇ 下载</a>' +
        '</div>';
      grid.appendChild(card);
    }

    files.forEach(function(f){
      if (isRawFile(f)) {
        // RAW 文件：用 RawPreview 提取预览图
        if (typeof RawPreview === 'undefined') {
          grid.innerHTML += '<p style="color:#ff5050;">RAW处理库未加载，请刷新页面重试。</p>';
          finishOne();
          return;
        }
        RawPreview.extract(f, function(err, result){
          if (err) {
            var errEl = document.createElement('div');
            errEl.style.cssText = 'color:#ff5050;font-size:13px;background:rgba(255,80,80,.06);border:1px solid rgba(255,80,80,.2);border-radius:8px;padding:12px 16px;margin-bottom:8px;';
            errEl.innerHTML = '<strong>' + f.name + '</strong>：RAW 转换失败<br/>' +
              '<span style="color:rgba(255,255,255,.6);font-size:12px;white-space:pre-line;">' + err.message + '</span><br/>' +
              '<span style="color:rgba(255,255,255,.4);font-size:11px;margin-top:6px;display:block;">📊 文件大小:' + (f.size/1024/1024).toFixed(2) + ' MB</span>';
            grid.appendChild(errEl);
            finishOne();
            return;
          }

          // ====== 核心优化：JPG输出且无增强时，直接使用原始JPEG数据，跳过canvas ======
          var name = f.name.replace(/\.[^.]+$/, '') + '.' + ext;
          var needsCanvas = (useEnh || (ext !== 'jpg' && ext !== 'jpeg'));

          if (!needsCanvas && result.blob) {
            // 直接使用原始 JPEG blob —— 零质量损失，避免 canvas tainted 问题
            var directUrl = URL.createObjectURL(result.blob);
            var card = document.createElement('div');
            card.className = 'result-item';
            card.innerHTML =
              '<img class="result-thumb" src="'+directUrl+'" alt="" style="max-width:100%;max-height:200px;object-fit:contain;border-radius:6px;" />' +
              '<div class="result-info">' +
                '<div class="result-name">'+name+'</div>' +
                '<div class="result-size">'+(result.blob.size/1024).toFixed(1)+' KB | 原始尺寸: '+(result.width||'?')+'x'+(result.height||'?')+' | 来源: '+result.source+'</div>'+
                '<a class="result-download" href="'+directUrl+'" download="'+name+'">⬇ 下载</a>' +
              '</div>';
            grid.appendChild(card);
            try { URL.revokeObjectURL(result.url); } catch(e){}
            finishOne();
            return;
          }

          // 需要色彩增强或格式转换时走处理流程
          // 关键修复：RAW预览图可能使用非sRGB色彩空间（如Adobe RGB），
          // 直接canvas.drawImage会变黑。需要先归一化为PNG，再处理。
          var img = new Image();
          img.onload = function(){
            var w = img.naturalWidth || img.width || 0;
            var h = img.naturalHeight || img.height || 0;

            if (w === 0 || h === 0) {
              grid.innerHTML += '<p style="color:#ff5050;">' + f.name + '：预览图尺寸无效（0x0），提取来源=' + (result.source||'?') + '</p>';
              try { URL.revokeObjectURL(result.url); } catch(e){}
              finishOne();
              return;
            }

            // ====== 第一步：归一化色彩空间 ======
            // 将原始JPEG绘制到临时canvas并导出为PNG，消除非sRGB色彩空间问题
            var normCanvas = document.createElement('canvas');
            normCanvas.width = w;
            normCanvas.height = h;
            var normCtx = normCanvas.getContext('2d');
            normCtx.drawImage(img, 0, 0);

            normCanvas.toBlob(function(normBlob){
              if (!normBlob) {
                // PNG导出也失败，直接用原始blob
                outputDirect(result.blob, result.size);
                return;
              }

              // ====== 第二步：加载归一化后的图像进行处理 ======
              var normImg = new Image();
              normImg.onload = function(){
                var finalCanvas;
                if (useEnh) {
                  finalCanvas = applyColorEnhance(normImg, mode, adj);
                  if (!finalCanvas || finalCanvas.width === 0) {
                    finalCanvas = document.createElement('canvas');
                    finalCanvas.width = w; finalCanvas.height = h;
                    finalCanvas.getContext('2d').drawImage(normImg, 0, 0);
                  }
                } else {
                  finalCanvas = document.createElement('canvas');
                  finalCanvas.width = w; finalCanvas.height = h;
                  finalCanvas.getContext('2d').drawImage(normImg, 0, 0);
                }

                var outMime = fmt === 'png' ? 'image/png' : fmt === 'webp' ? 'image/webp' : 'image/jpeg';
                finalCanvas.toBlob(function(finalBlob){
                  if (!finalBlob || finalBlob.size < 100) {
                    // 处理失败，降级为原始JPEG
                    outputDirect(result.blob, result.size);
                    return;
                  }
                  outputResult(finalBlob, w, h, name);
                }, outMime, q);
              };
              normImg.onerror = function(){ outputDirect(result.blob, result.size); };
              normImg.src = URL.createObjectURL(normBlob);

            }, 'image/png'); // 用PNG无损格式做中间转换

          };

          // 辅助函数：直接输出原始blob
          function outputDirect(blob, size){
            var url = URL.createObjectURL(blob);
            var nm = f.name.replace(/\.[^.]+$/, '.') + 'jpg';
            var card = document.createElement('div');
            card.className = 'result-item';
            card.innerHTML =
              '<img class="result-thumb" src="'+url+'" alt="" style="max-width:100%;max-height:200px;object-fit:contain;border-radius:6px;" />' +
              '<div class="result-info">' +
                '<div class="result-name">'+nm+' <span style="color:#f0a030;font-size:11px;">(原始预览)</span></div>' +
                '<div class="result-size">'+(size/1024).toFixed(1)+' KB</div>' +
                '<a class="result-download" href="'+url+'" download="'+nm+'">⬇ 下载</a>' +
              '</div>';
            grid.appendChild(card);
            try { URL.revokeObjectURL(result.url); } catch(e){}
            finishOne();
          }

          // 辅助函数：输出最终结果卡片
          function outputResult(blob, w, h, nm){
            var outUrl = URL.createObjectURL(blob);
            var card = document.createElement('div');
            card.className = 'result-item';
            card.innerHTML =
              '<img class="result-thumb" src="'+outUrl+'" alt="" style="max-width:100%;max-height:200px;object-fit:contain;border-radius:6px;" />' +
              '<div class="result-info">' +
                '<div class="result-name">'+nm+'</div>' +
                '<div class="result-size">'+(blob.size/1024).toFixed(1)+' KB | 原始尺寸: '+w+'x'+h+'</div>' +
                '<a class="result-download" href="'+outUrl+'" download="'+nm+'">⬇ 下载</a>' +
              '</div>';
            grid.appendChild(card);
            try { URL.revokeObjectURL(result.url); } catch(e){}
            finishOne();
          }

          img.onerror = function(){
            // Image 加载也失败，尝试直接把原始 blob 当作结果
            if (result.blob) { outputDirect(result.blob, result.size); }
            else {
              grid.innerHTML += '<p style="color:#ff5050;">' + f.name + '：预览图加载失败（来源: '+(result.source||'?')+'）</p>';
              finishOne();
            }
          };
          img.src = result.url;
        });
      } else {
        // 普通图片
        var reader = new FileReader();
        reader.onload = function(ev){
          var img = new Image();
          img.onload = function(){
            var canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            // 普通图片也支持手动调色
            var hasAdj = adj.brightness!==0 || adj.contrast!==0 || adj.saturation!==0 || adj.temperature!==0 || adj.tint!==0;
            if (hasAdj) {
              // 重新绘制并应用调色
              canvas = applyColorEnhance(img, 'auto', adj);
            }

            canvas.toBlob(function(blob){
              var outUrl = URL.createObjectURL(blob);
              var name = f.name.replace(/\.[^.]+$/, '') + '.' + ext;
              addResultCard(name, outUrl, blob);
              finishOne();
            }, fmt, q);
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(f);
      }
    });
  });

})();
