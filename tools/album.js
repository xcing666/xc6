/* ============================================================
 *  翻页画册工具 - album.js  (v4)
 *  功能：图片上传 + 拖拽排序 + 真书翻页 + 封面/封底 + 全屏放大
 *  变更（v4）：
 *    1. 真书结构：第 1 张 = 封面（单张居中）、最后 1 张 = 封底（单张居中），
 *       中间各张两两成对跨页；翻开封面 → 左 = 封面背面(第 2 张)、右 = 第一页(第 3 张)
 *    2. 删掉「开始翻页」时的浮层提示
 *    3. 翻页性能优化：预合成底层 + 预缩放纸面 + 降采样 + 关投影，明显不卡
 *    4. 新增「🔍 放大」：整本书搬到全屏层，电脑端大图、手机横过来即大图
 * ============================================================ */
(function () {
  'use strict';

  /* ---------- DOM ---------- */
  const $ = (id) => document.getElementById(id);
  const uploadZone = $('uploadZone');
  const fileInput = $('fileInput');
  const thumbsPanel = $('thumbsPanel');
  const thumbsGrid = $('thumbsGrid');
  const thumbsMeta = $('thumbsMeta');
  const btnAddMore = $('btnAddMore');
  const btnClearAll = $('btnClearAll');
  const thumbsActions = $('thumbsActions');
  const clearConfirm = $('clearConfirm');
  const clearCount = $('clearCount');
  const ccCancel = $('ccCancel');
  const ccOk = $('ccOk');
  const btnStartBook = $('btnStartBook');
  const bookStage = $('bookStage');
  const book = $('book');
  const bookWrap = $('bookWrap');
  const imgLeft = $('imgLeft');
  const imgRight = $('imgRight');
  const pageLeft = $('pageLeft');
  const pageRight = $('pageRight');
  const lightbox = $('lightbox');
  const lightboxImg = $('lightboxImg');
  const bookInfo = $('bookInfo');
  const pageNum = $('pageNum');
  const btnPrev = $('btnPrev');
  const btnNext = $('btnNext');
  const btnEditAgain = $('btnEditAgain');
  const btnDownload = $('btnDownload');
  const toggleSound = $('toggleSound');
  const toggleAuto = $('toggleAuto');
  const toggleBig = $('toggleBig');
  const bigView = $('bigView');
  const bvWrap = $('bvWrap');
  const bvClose = $('bvClose');

  /* ---------- 状态 ---------- */
  let images = []; // [{ id, src, name, w, h, el }]
  /* screens：一屏一项。{ l, r, solo } —— l/r 是 images 下标（-1 = 无）
   *   · 第 1 屏 = 封面（solo，单张居中）
   *   · 中间每屏 = 左右各一张（成对跨页）
   *   · 最后一屏 = 封底（solo，单张居中）
   *  纯封面翻开后：左 = 封面背面(第 2 张)，右 = 第一页(第 3 张)，与云展一致 */
  let screens = [];
  let spread = 0;   // 当前屏下标
  let totalSpreads = 0;
  let bookAR = 1; // 单页宽高比
  let bookOrient = 'landscape'; // landscape | portrait
  let soundOn = true;
  let autoOn = false;
  let autoTimer = null;
  let audioCtx = null;
  let flipping = false;   // 翻页动画进行中，防止连点
  let immersive = false;  // 放大模式（全屏看画册）
  let bookHomeParent = null, bookHomeNext = null; // 放大时书被移走，记住原位好还原

  /* ---------- 步骤指示 ---------- */
  function setStep(n) {
    document.querySelectorAll('.step-pill').forEach((p) => {
      const s = +p.dataset.step;
      p.classList.remove('active', 'done');
      if (s === n) p.classList.add('active');
      else if (s < n) p.classList.add('done');
    });
  }

  /* ---------- Web Audio 翻书声 ---------- */
  function ensureAudio() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { return null; }
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  function playFlipSound() {
    if (!soundOn) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    const dur = 0.32;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.6;
    const noise = ctx.createBufferSource(); noise.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2500; bp.Q.value = 0.8;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 800;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    noise.connect(bp); bp.connect(hp); hp.connect(gain); gain.connect(ctx.destination);
    noise.start(); noise.stop(ctx.currentTime + dur);
    setTimeout(() => {
      if (!soundOn) return;
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(120, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.08);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.08, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.1);
    }, 200);
  }

  /* ---------- 提取图片 ---------- */
  async function handleFiles(files) {
    const list = Array.from(files);
    const imgList = list.filter((f) => f.type.startsWith('image/'));
    const skipped = list.length - imgList.length;
    for (const f of imgList) await readImage(f);
    if (skipped > 0) showToast(`已跳过 ${skipped} 个非图片文件（仅支持图片）`);
    renderThumbs();
  }

  function readImage(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const src = e.target.result;
        const img = new Image();
        img.onload = () => {
          images.push({
            id: 'i' + Date.now() + Math.random().toString(36).slice(2, 8),
            src, name: file.name,
            w: img.naturalWidth, h: img.naturalHeight,
            el: img, // 缓存已加载的 <img>，供 canvas 圆柱渲染直接 drawImage
          });
          resolve();
        };
        img.onerror = () => resolve();
        img.src = src;
      };
      reader.onerror = () => resolve();
      reader.readAsDataURL(file);
    });
  }

  /* ---------- 上传区交互 ---------- */
  uploadZone.addEventListener('click', () => fileInput.click());
  uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('drag'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag'));
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag');
    handleFiles(e.dataTransfer.files);
  });
  fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
  btnAddMore.addEventListener('click', () => fileInput.click());
  /* 清空：用站内确认条，不用原生 confirm()
   * （部分手机内置浏览器会吞掉原生弹窗 → 按钮点了像没反应） */
  btnClearAll.addEventListener('click', () => {
    if (!images.length) { showToast('还没有图片可以清空'); return; }
    clearCount.textContent = images.length;
    clearConfirm.classList.add('show');
    if (thumbsActions) thumbsActions.style.display = 'none';
  });
  if (ccCancel) ccCancel.addEventListener('click', hideClearConfirm);
  if (ccOk) ccOk.addEventListener('click', () => {
    images = [];
    hideClearConfirm();
    renderThumbs();
    showToast('已清空，可重新上传');
  });
  function hideClearConfirm() {
    if (clearConfirm) clearConfirm.classList.remove('show');
    if (thumbsActions) thumbsActions.style.display = '';
  }

  /* ---------- 缩略图渲染 ---------- */
  function renderThumbs() {
    hideClearConfirm(); // 列表一变就收起确认条，避免残留
    thumbsGrid.innerHTML = '';
    images.forEach((img, i) => {
      const el = document.createElement('div');
      el.className = 'thumb';
      el.draggable = true;
      el.dataset.id = img.id;
      el.innerHTML = `
        <span class="idx">${i + 1}</span>
        <img src="${img.src}" alt="${img.name}" />
        <span class="orient">${img.w >= img.h ? '横' : '竖'}</span>
        <button class="del" aria-label="删除" title="删除">×</button>
      `;
      el.querySelector('.del').addEventListener('click', (e) => {
        e.stopPropagation();
        images = images.filter((x) => x.id !== img.id);
        renderThumbs();
      });
      attachDrag(el, img);
      thumbsGrid.appendChild(el);
    });
    thumbsMeta.textContent = `${images.length} 张`;
    thumbsPanel.classList.toggle('show', images.length > 0);
    setStep(images.length > 0 ? 2 : 1);
  }

  /* ============================================================
   *  拖拽排序 —— 单例全局 pointer 监听，transform 偏移，
   *  避免网格重排落点失效、多 thumb 监听互相干扰
   * ============================================================ */
  const drag = {
    el: null, img: null,
    rect0: null, dx: 0, dy: 0,
    longTimer: null,
    dragging: false,
    pointerId: null,
    lastX: 0, lastY: 0,
    canMove: false,
    htmlDrag: false,
  };
  const LONG_PRESS = 180;
  const CANCEL_MOVE = 5;

  function dragStart(x, y) {
    drag.rect0 = drag.el.getBoundingClientRect();
    drag.dx = x - drag.rect0.left;
    drag.dy = y - drag.rect0.top;
    drag.canMove = true;
    drag.longTimer = setTimeout(() => dragBegin(), LONG_PRESS);
  }
  function dragBegin() {
    if (!drag.el) return;
    drag.dragging = true;
    drag.el.classList.add('dragging');
    drag.el.style.zIndex = '9999';
    drag.el.style.willChange = 'transform';
    drag.el.style.transform = 'translate(0px, 0px)';
    if (navigator.vibrate) navigator.vibrate(25);
  }
  function dragMove(x, y) {
    drag.lastX = x; drag.lastY = y;
    if (!drag.dragging) {
      if (drag.canMove && drag.longTimer &&
          (Math.abs(x - (drag.rect0.left + drag.dx)) > CANCEL_MOVE ||
           Math.abs(y - (drag.rect0.top + drag.dy)) > CANCEL_MOVE)) {
        clearTimeout(drag.longTimer); drag.longTimer = null;
      }
      return;
    }
    const tx = (x - drag.rect0.left) - drag.dx;
    const ty = (y - drag.rect0.top) - drag.dy;
    drag.el.style.transform = `translate(${tx}px, ${ty}px)`;
    document.querySelectorAll('.thumb').forEach((t) => {
      if (t === drag.el) return;
      const r = t.getBoundingClientRect();
      if (x > r.left && x < r.right && y > r.top && y < r.bottom) t.classList.add('over');
      else t.classList.remove('over');
    });
  }
  function dragEnd(x, y) {
    if (drag.longTimer) { clearTimeout(drag.longTimer); drag.longTimer = null; }
    if (!drag.dragging) { dragReset(); return; }
    if (x === 0 && y === 0 && (drag.lastX !== 0 || drag.lastY !== 0)) { x = drag.lastX; y = drag.lastY; }
    let target = null;
    document.querySelectorAll('.thumb').forEach((t) => {
      if (t === drag.el) return;
      const r = t.getBoundingClientRect();
      if (x > r.left && x < r.right && y > r.top && y < r.bottom) target = t;
    });
    if (target) {
      const fromIdx = images.findIndex((it) => it.id === drag.img.id);
      const toIdx = images.findIndex((it) => it.id === target.dataset.id);
      if (fromIdx >= 0 && toIdx >= 0 && fromIdx !== toIdx) {
        const [moved] = images.splice(fromIdx, 1);
        images.splice(toIdx, 0, moved);
      }
    }
    dragReset();
    renderThumbs();
  }
  function dragReset() {
    document.querySelectorAll('.thumb').forEach((t) => t.classList.remove('over', 'dragging'));
    if (drag.el) { drag.el.style.transform = ''; drag.el.style.zIndex = ''; drag.el.style.willChange = ''; }
    drag.el = null; drag.img = null;
    drag.rect0 = null; drag.dragging = false; drag.canMove = false;
    drag.pointerId = null;
    drag.lastX = 0; drag.lastY = 0;
  }

  if (window.PointerEvent) {
    document.addEventListener('pointermove', (e) => {
      if (drag.pointerId === null || e.pointerId !== drag.pointerId) return;
      if (drag.canMove || drag.dragging) {
        dragMove(e.clientX, e.clientY);
        if (drag.dragging) e.preventDefault();
      }
    }, { passive: false });
    const endHandler = (e) => {
      if (drag.pointerId === null || e.pointerId !== drag.pointerId) return;
      dragEnd(e.clientX, e.clientY);
    };
    document.addEventListener('pointerup', endHandler);
    document.addEventListener('pointercancel', endHandler);
  }

  function attachDrag(el, img) {
    if (window.PointerEvent) {
      el.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.del')) return;
        if (drag.el) return;
        drag.el = el;
        drag.img = img;
        drag.pointerId = e.pointerId;
        dragStart(e.clientX, e.clientY);
        e.preventDefault();
      });
    } else {
      el.addEventListener('touchstart', (e) => {
        if (drag.el) return;
        const t = e.touches[0];
        drag.el = el; drag.img = img;
        dragStart(t.clientX, t.clientY);
      }, { passive: true });
      el.addEventListener('touchmove', (e) => {
        if (!drag.el) return;
        const t = e.touches[0];
        dragMove(t.clientX, t.clientY);
        if (drag.dragging) e.preventDefault();
      }, { passive: false });
      el.addEventListener('touchend', (e) => {
        if (!drag.el) return;
        const t = (e.changedTouches && e.changedTouches[0]) || { clientX: 0, clientY: 0 };
        dragEnd(t.clientX, t.clientY);
      });
      el.addEventListener('mousedown', (e) => {
        if (drag.el) return;
        e.preventDefault();
        drag.el = el; drag.img = img;
        dragStart(e.clientX, e.clientY);
      });
    }
    el.addEventListener('dragstart', (e) => {
      if (drag.dragging) { e.preventDefault(); return; }
      drag.htmlDrag = true;
      el.classList.add('dragging');
      try { e.dataTransfer.setData('text/plain', img.id); } catch (err) {}
      e.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      document.querySelectorAll('.thumb').forEach((t) => t.classList.remove('over'));
      drag.htmlDrag = false;
      renderThumbs();
    });
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('over'); });
    el.addEventListener('dragleave', () => el.classList.remove('over'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('over');
      if (!drag.htmlDrag) return;
      drag.htmlDrag = false;
      const srcId = e.dataTransfer.getData('text/plain') || img.id;
      const fromIdx = images.findIndex((it) => it.id === srcId);
      const toIdx = images.findIndex((it) => it.id === img.id);
      if (fromIdx >= 0 && toIdx >= 0 && fromIdx !== toIdx) {
        const [moved] = images.splice(fromIdx, 1);
        images.splice(toIdx, 0, moved);
        renderThumbs();
      }
    });
  }

  /* ============================================================
   *  方向自动识别 —— 用中位宽高比决定书的展开比例与横竖
   * ============================================================ */
  function detectAR() {
    if (!images.length) return 1;
    const ars = images.map((x) => x.w / Math.max(1, x.h));
    ars.sort((a, b) => a - b);
    const mid = ars[Math.floor(ars.length / 2)];
    // 收敛到真实画册的页面比例区间（横 4:3≈1.33、3:2≈1.5、竖 A4≈0.71、3:4≈0.75 都落在内），
    // 常规横/竖图几乎不裁切；超宽/超高的极端图用 cover 填满页面：既不留白，也不把书压得过扁/过高
    return Math.min(Math.max(mid, 0.7), 1.6);
  }

  /* ---------- 开始翻页 ---------- */
  btnStartBook.addEventListener('click', async () => {
    if (!images.length) { showToast('请先上传图片'); return; }
    setStep(3);
    thumbsPanel.style.display = 'none';
    bookStage.classList.add('show');
    document.body.classList.add('tool-active');
    buildBook();
    bookStage.scrollIntoView({ behavior: 'smooth', block: 'start' });
    ensureAudio();
  });
  btnEditAgain.addEventListener('click', () => {
    if (immersive) exitBig();
    bookStage.classList.remove('show');
    thumbsPanel.style.display = 'block';
    thumbsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setStep(2);
    document.body.classList.remove('tool-active');
    stopAuto();
  });

  /* ============================================================
   *  生成真正的「翻开的书」：
   *    第 1 张 = 封面（单张居中）→ 翻开 → 左 = 封面背面(第 2 张)、右 = 第一页(第 3 张)
   *    → 之后两两成对 → 最后一屏 = 封底（单张居中）
   * ============================================================ */
  function buildScreens() {
    const n = images.length;
    screens = [];
    if (!n) { screens = [{ l: -1, r: -1, solo: true }]; return; }
    if (n === 1) { screens = [{ l: 0, r: -1, solo: true }]; return; }
    screens.push({ l: 0, r: -1, solo: true });                     // 封面
    for (let i = 1; i <= n - 2; i += 2) {                          // 中间两两成对
      screens.push({ l: i, r: (i + 1 <= n - 2) ? i + 1 : -1, solo: false });
    }
    screens.push({ l: -1, r: n - 1, solo: true });                 // 封底
  }
  const itm = (i) => (i >= 0 && i < images.length ? images[i] : null);

  function buildBook() {
    buildScreens();
    totalSpreads = screens.length;
    spread = 0;

    // 单页比例（中位宽高比）；宽>1 → 横版书，<1 → 竖版书
    bookAR = detectAR();
    bookOrient = bookAR >= 1 ? 'landscape' : 'portrait';

    renderSpread();
    updateInfo();
  }

  /* 把当前屏铺到左右页；封面/封底用右页容器铺满整本书（.solo 单张居中） */
  function renderSpread() {
    const s = screens[spread] || { l: -1, r: -1, solo: true };
    book.classList.toggle('solo', !!s.solo);
    if (s.solo) {
      setSide(imgRight, pageRight, itm(s.l >= 0 ? s.l : s.r));
      setSide(imgLeft, pageLeft, null);
    } else {
      setSide(imgLeft, pageLeft, itm(s.l));
      setSide(imgRight, pageRight, itm(s.r));
    }
    fitBook();
  }
  function setSide(img, box, item) {
    if (item) {
      img.src = item.src;
      img.alt = item.name || '';
      img.style.display = '';
      box.classList.remove('empty');
    } else {
      img.removeAttribute('src');
      img.alt = '';
      img.style.display = 'none';
      box.classList.add('empty');
    }
  }

  /* 根据横竖比例把书放进视口：
   *   跨页屏（solo=false）：宽 = 2 页，撑满；
   *   封面/封底屏（solo=true）：宽 = 1 页，居中单张，两侧不留白。
   *   放大模式下改用全屏容器尺寸计算 → 手机横屏即大图。 */
  function fitBook() {
    const solo = !!(screens[spread] && screens[spread].solo);
    const asp = solo ? bookAR : bookAR * 2;   // 整本书 宽/高
    let maxW, maxH;
    if (immersive) {
      maxW = Math.max(160, (bvWrap.clientWidth || window.innerWidth) - 24);
      maxH = Math.max(180, (bvWrap.clientHeight || window.innerHeight * 0.8) - 12);
    } else {
      const wrapW = (bookWrap && bookWrap.clientWidth) || 720;
      maxW = solo ? Math.min(wrapW, 520) : wrapW;
      maxH = Math.max(240, window.innerHeight * 0.72);
    }
    const minH = (!immersive && window.innerWidth <= 768) ? 200 : 0;
    let w = Math.max(160, maxW);
    let h = w / asp;
    if (h > maxH) { h = maxH; w = h * asp; }
    if (h < minH) { h = minH; w = h * asp; }
    if (w > maxW) { w = maxW; h = w / asp; }
    book.style.width = Math.round(w) + 'px';
    book.style.height = Math.round(h) + 'px';
  }
  window.addEventListener('resize', () => {
    if (bookStage.classList.contains('show')) fitBook();
  });
  window.addEventListener('orientationchange', () => {
    if (bookStage.classList.contains('show')) setTimeout(fitBook, 250);
  });

  /* ============================================================
   *  翻页（像素级圆柱卷曲）—— 用 canvas 重绘正在翻的纸：
   *  把纸切成 N 条，每条按「圆柱面 + 整体绕书脊翻转 + 透视」投影
   *  重新绘制，纸在翻页中真的弯成弧面。最接近云展真书。
   * ============================================================ */
  const TURN_MS = 900;
  const PAGE_SEG = 30;   // 切片条数（32 左右足够顺滑，太多会卡）
  const CAM_DIST = 1400; // 相机距离（透视强度）
  let turningLayer = null;
  let rafTurn = null;
  let turnCtx = null;
  let turnW = 0, turnH = 0, turnDpr = 1;
  let turnBase = null;   // 底层两页（一次性合成，每帧只贴 1 次）
  let turnFront = null;  // 翻动纸正面（预缩放到单页尺寸，切片时不用反复缩放原图）
  let turnBack = null;   // 翻动纸背面

  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  // 在 book 上创建一个覆盖整页的 canvas（书脊在中央）
  function buildTurning() {
    if (turningLayer) { turningLayer.remove(); turningLayer = null; }
    const rect = book.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width)), h = Math.max(1, Math.round(rect.height));
    // ⚡ 大画布降采样：DPR 越高，每帧要填的像素越多，是卡顿主因
    const raw = window.devicePixelRatio || 1;
    const dpr = Math.min(raw, w >= 700 ? 1.4 : 1.8);
    const c = document.createElement('canvas');
    c.className = 'turning';
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    c.style.width = w + 'px';
    c.style.height = h + 'px';
    book.appendChild(c);
    turningLayer = c;
    turnCtx = c.getContext('2d');
    turnCtx.imageSmoothingQuality = 'low';
    turnCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    turnW = w; turnH = h; turnDpr = dpr;
    return c;
  }

  /* 把一张图按 cover 方式铺满一个矩形 */
  function drawFit(cx, item, x0, y0, w, h) {
    if (!item || !item.el) return;
    const iw = item.el.naturalWidth || item.w || 0;
    const ih = item.el.naturalHeight || item.h || 0;
    if (!iw || !ih) return;
    const s = Math.max(w / iw, h / ih);
    const dw = iw * s, dh = ih * s;
    cx.drawImage(item.el, x0 + (w - dw) / 2, y0 + (h - dh) / 2, dw, dh);
  }

  /* 预合成：底层两页 + 正/背面各缩放到「单页尺寸」的小画布
   *  好处：每帧只做 30 次小画布切片，不再从 4K 原图上反复缩放取样 */
  function buildTurnSlices(baseL, baseR, front, back) {
    const pw = Math.max(1, Math.round(turnW / 2)), ph = Math.max(1, Math.round(turnH));
    const mk = (item) => {
      if (!item || !item.el) return null;
      const c = document.createElement('canvas');
      c.width = pw; c.height = ph;
      drawFit(c.getContext('2d'), item, 0, 0, pw, ph);
      return c;
    };
    turnFront = mk(front);
    turnBack = mk(back);
    const b = document.createElement('canvas');
    b.width = pw * 2; b.height = ph;
    const bx = b.getContext('2d');
    drawFit(bx, baseL, 0, 0, pw, ph);
    if (baseR) drawFit(bx, baseR, pw, 0, pw, ph);
    turnBase = b;
  }

  /* 圆柱卷曲核心（性能优化版）：
   *   底层两页 → 一次性合成好的 turnBase 贴图
   *   翻动纸   → 预先缩放到单页尺寸的 turnFront / turnBack，逐条切片
   *   p 进度、baseDeg 当前翻转角（0=右侧平放，-180=翻到左侧平放） */
  function renderCurl(p, baseDeg) {
    const ctx = turnCtx;
    const W = turnW, H = turnH;
    if (turnBase) ctx.drawImage(turnBase, 0, 0, W, H);
    else { ctx.clearRect(0, 0, W, H); }

    const useBack = baseDeg <= -90;
    const page = useBack ? turnBack : turnFront;
    if (!page) return;

    const pageW = W / 2;      // 单页宽（书脊到自由边）
    const bookCx = pageW;     // 书脊在 canvas 中央
    const N = PAGE_SEG;
    const stripSrc = page.width / N;   // 每条在源上的宽度
    const segW = pageW / N;            // 每条在"展开纸"上的弧长
    const aMax = 0.05 + 0.30 * Math.sin(Math.PI * Math.min(1, Math.max(0, p)));
    const R = pageW / Math.max(aMax, 0.02);
    const base = baseDeg * Math.PI / 180;
    const cosB = Math.cos(base), sinB = Math.sin(base);
    const dist = CAM_DIST;
    let boxMin = W, boxMax = 0;

    for (let i = 0; i < N; i++) {
      const s0 = i * segW, s1 = (i + 1) * segW;
      const a0 = s0 / R, a1 = s1 / R;
      const x0 = R * Math.sin(a0), z0 = R * (1 - Math.cos(a0));
      const x1 = R * Math.sin(a1), z1 = R * (1 - Math.cos(a1));
      const xr0 = x0 * cosB - z0 * sinB, zr0 = x0 * sinB + z0 * cosB;
      const xr1 = x1 * cosB - z1 * sinB, zr1 = x1 * sinB + z1 * cosB;
      const sc0 = dist / (dist - zr0);
      const sc1 = dist / (dist - zr1);
      const X0 = bookCx + xr0 * sc0;
      const X1 = bookCx + xr1 * sc1;
      const dstX = Math.round(Math.min(X0, X1));
      const dstW = Math.max(1, Math.round(Math.abs(X1 - X0)) + 1);
      const dstH = Math.min(H, H * (sc0 + sc1) / 2);
      const dstY = (H - dstH) / 2;
      if (dstX < boxMin) boxMin = dstX;
      if (dstX + dstW > boxMax) boxMax = dstX + dstW;
      // 背面时源切片倒序，保证翻过去后图片方向正常（不镜像）
      const si = useBack ? (N - 1 - i) : i;
      ctx.drawImage(page, si * stripSrc, 0, stripSrc, page.height, dstX, dstY, dstW, dstH);
    }

    // 鼓面高光（只在纸覆盖的条带内绘制，省一次全屏填充）
    const sweep = Math.sin(Math.PI * Math.min(1, Math.max(0, p)));
    if (sweep > 0.03 && boxMax > boxMin) {
      const g = ctx.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,' + (0.10 * sweep).toFixed(2) + ')');
      g.addColorStop(1, 'rgba(0,0,0,' + (0.14 * sweep).toFixed(2) + ')');
      ctx.fillStyle = g;
      ctx.fillRect(boxMin, 0, boxMax - boxMin, H);
    }
  }

  /* next=true 翻下一屏（右页卷入左侧）；false 翻上一屏（左页转回右侧）
   *   · 跨页 ↔ 跨页：canvas 圆柱卷曲
   *   · 封面/封底（单张）↔ 跨页：淡入淡出切换（单张没有可卷的对页） */
  function startTurn(next) {
    if (flipping) return;
    if (next && spread >= totalSpreads - 1) return;
    if (!next && spread <= 0) return;

    const cur = screens[spread];
    const nxt = screens[next ? spread + 1 : spread - 1];
    if (!cur || !nxt) return;

    if (cur.solo || nxt.solo) { fadeSwitch(next); return; }

    let frontImg, backImg, baseLeftImg, baseRightImg;
    if (next) {
      frontImg     = itm(cur.r);   // 翻动纸正面 = 当前屏右页
      backImg      = itm(nxt.l);   // 翻动纸背面 = 下一屏左页
      baseLeftImg  = itm(cur.l);   // 底层左：当前屏左页（将被盖住）
      baseRightImg = itm(nxt.r);   // 底层右：下一屏右页（翻走后露出）
    } else {
      frontImg     = itm(nxt.r);   // 翻动纸正面 = 上一屏右页
      backImg      = itm(cur.l);   // 翻动纸背面 = 当前屏左页
      baseLeftImg  = itm(nxt.l);   // 底层左：上一屏左页（翻回后露出）
      baseRightImg = itm(cur.r);   // 底层右：当前屏右页（将被盖住）
    }

    // 没有任何可画的纸（例如缺图），直接切换
    if (!frontImg && !backImg) { fadeSwitch(next); return; }

    flipping = true;
    buildTurning();
    buildTurnSlices(baseLeftImg, baseRightImg, frontImg, backImg);
    book.classList.add('flipping');   // 关掉 drop-shadow，翻页更顺
    playFlipSound();

    const from = next ? 0 : -180;     // 翻下屏：0° → -180°；翻上屏反向
    const to = next ? -180 : 0;
    const start = performance.now();
    cancelAnimationFrame(rafTurn);

    function frame(now) {
      const p = Math.min(1, (now - start) / TURN_MS);
      const e = easeInOut(p);
      renderCurl(p, from + (to - from) * e);
      if (p < 1) {
        rafTurn = requestAnimationFrame(frame);
      } else {
        if (turningLayer) { turningLayer.remove(); turningLayer = null; }
        turnBase = turnFront = turnBack = null;
        book.classList.remove('flipping');
        spread = next ? spread + 1 : spread - 1;
        renderSpread();
        updateInfo();
        flipping = false;
      }
    }
    rafTurn = requestAnimationFrame(frame);
  }

  /* 单张（封面/封底）与跨页之间：淡出 → 换页 → 淡入，不生硬跳变 */
  function fadeSwitch(next) {
    flipping = true;
    playFlipSound();
    book.classList.add('fading');
    setTimeout(() => {
      spread = next ? spread + 1 : spread - 1;
      renderSpread();
      updateInfo();
      book.classList.remove('fading');
      flipping = false;
    }, 170);
  }

  function goNext() { startTurn(true); }
  function goPrev() { startTurn(false); }
  btnPrev.addEventListener('click', goPrev);
  btnNext.addEventListener('click', goNext);

  function updateInfo() {
    const s = screens[spread] || {};
    const n = images.length;
    let label;
    if (s.solo && spread === 0) label = `封面 · 共 ${n} 张`;
    else if (s.solo) label = `封底 · 共 ${n} 张`;
    else if (n) {
      const a = s.l + 1;
      const b = s.r >= 0 ? s.r + 1 : a;
      label = `第 ${a}${b > a ? '-' + b : ''} 张 · 共 ${n} 张`;
    } else label = '—';
    bookInfo.textContent = `${bookOrient === 'landscape' ? '横版书' : '竖版书'} · ${label}`;
    const inner = totalSpreads - 2; // 去掉封面、封底
    if (spread === 0) pageNum.textContent = '封面';
    else if (spread >= totalSpreads - 1) pageNum.textContent = '封底';
    else pageNum.textContent = `${spread} / ${inner}`;
    btnPrev.disabled = spread === 0;
    btnNext.disabled = spread >= totalSpreads - 1;
  }

  /* ---------- 切换 ---------- */
  toggleSound.addEventListener('click', () => {
    soundOn = !soundOn;
    toggleSound.classList.toggle('on', soundOn);
    toggleSound.textContent = soundOn ? '🔊 翻书声' : '🔇 静音';
    if (soundOn) ensureAudio();
  });
  toggleAuto.addEventListener('click', () => {
    autoOn = !autoOn;
    toggleAuto.classList.toggle('on', autoOn);
    if (autoOn) startAuto(); else stopAuto();
  });

  /* ============================================================
   *  放大模式：把整本书搬到全屏层里（电脑端 = 大图，手机横过来 = 大图）
   *  书还是同一本书 —— DOM 只是换了个爹，事件监听全都在，翻页照常
   * ============================================================ */
  toggleBig.addEventListener('click', () => { immersive ? exitBig() : enterBig(); });
  if (bvClose) bvClose.addEventListener('click', () => exitBig());

  function enterBig() {
    if (immersive || !bookStage.classList.contains('show')) return;
    immersive = true;
    bookHomeParent = book.parentNode;
    bookHomeNext = book.nextSibling;
    bvWrap.appendChild(book);
    bigView.classList.add('show');
    document.body.classList.add('immersive');
    toggleBig.classList.add('on');
    toggleBig.textContent = '✕ 退出放大';
    fitBook();
    tryFullscreen(true);
  }
  function exitBig() {
    if (!immersive) return;
    immersive = false;
    bigView.classList.remove('show');
    document.body.classList.remove('immersive');
    toggleBig.classList.remove('on');
    toggleBig.textContent = '🔍 放大';
    if (bookHomeParent) {
      if (bookHomeNext && bookHomeNext.parentNode === bookHomeParent) bookHomeParent.insertBefore(book, bookHomeNext);
      else bookHomeParent.appendChild(book);
    }
    bookHomeParent = null; bookHomeNext = null;
    tryFullscreen(false);
    fitBook();
  }
  /* 尽量再进一层系统全屏（顺带尝试锁横屏；不支持就静默跳过，界面照样是全屏的） */
  function tryFullscreen(on) {
    try {
      if (on) {
        const el = document.documentElement;
        if (document.fullscreenEnabled && !document.fullscreenElement && el.requestFullscreen) {
          const p = el.requestFullscreen({ navigationUI: 'hide' });
          if (p && p.catch) p.catch(() => {});
        }
        setTimeout(() => {
          try {
            const so = screen.orientation;
            if (immersive && so && so.lock) { const r = so.lock('landscape'); if (r && r.catch) r.catch(() => {}); }
          } catch (e) {}
        }, 280);
      } else {
        try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) {}
        if (document.fullscreenElement && document.exitFullscreen) {
          const p = document.exitFullscreen();
          if (p && p.catch) p.catch(() => {});
        }
      }
    } catch (e) { /* 忽略：iOS Safari 等不支持时不影响放大模式本身 */ }
  }
  document.addEventListener('fullscreenchange', () => {
    if (immersive && !document.fullscreenElement) exitBig();  // 用户按 Esc 退出系统全屏
  });

  function startAuto() {
    stopAuto();
    autoTimer = setInterval(() => {
      if (spread >= totalSpreads - 1) {
        // 已到最后一屏：连续往回翻到第一屏，等动画走完再继续
        (function back() {
          if (spread <= 0 || !autoOn) return;
          goPrev();
          setTimeout(back, TURN_MS + 80);
        })();
      } else {
        goNext();
      }
    }, 3500);
  }
  function stopAuto() { if (autoTimer) clearInterval(autoTimer); autoTimer = null; }

  /* ---------- 键盘 ---------- */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (lightbox.classList.contains('show')) { closeLightbox(); return; }
      if (immersive) { exitBig(); return; }
    }
    if (lightbox.classList.contains('show')) return;
    if (!bookStage.classList.contains('show')) return;
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); goNext(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
  });

  /* ---------- 滑动 / 单击 / 双击（统一用指针事件判定） ----------
   * ⚠️ 移动端「双击」的第二次 tap，浏览器不会派发 click（被当作双击缩放手势吞掉），
   *    所以双击判定不能挂在 click 上，必须在 pointerup / touchend 上做 tap 判定。 */
  let swStartX = 0, swStartY = 0, swActive = false, swWasSwipe = false;
  const TAP_MOVE = 10; // 位移小于此值 → 视为点击
  function onSwipeStart(x, y) {
    if (drag.dragging || flipping) return;
    swActive = true; swStartX = x; swStartY = y; swWasSwipe = false;
  }
  function onSwipeMove(x, y) {
    if (!swActive) return;
    if (Math.abs(x - swStartX) > TAP_MOVE || Math.abs(y - swStartY) > TAP_MOVE) swWasSwipe = true;
  }
  function onSwipeEnd(x, y) {
    if (!swActive) return; swActive = false;
    if (flipping) return;
    const dx = x - swStartX, dy = y - swStartY;
    if (!swWasSwipe) { handleTap(x, y); return; }                    // 没移动 → 点击 / 双击
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;    // 位移不足或偏纵向 → 不算滑动
    if (dx < 0) goNext(); else goPrev();
  }
  book.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    onSwipeStart(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  book.addEventListener('touchmove', (e) => {
    if (!swActive || !e.touches.length) return;
    onSwipeMove(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  book.addEventListener('touchend', (e) => {
    const t = (e.changedTouches && e.changedTouches[0]) || null;
    if (!t) return;
    onSwipeEnd(t.clientX, t.clientY);
  });
  book.addEventListener('pointerdown', (e) => { onSwipeStart(e.clientX, e.clientY); });
  book.addEventListener('pointermove', (e) => { onSwipeMove(e.clientX, e.clientY); });
  book.addEventListener('pointerup', (e) => { onSwipeEnd(e.clientX, e.clientY); });
  book.addEventListener('pointercancel', () => { swActive = false; });

  /* ---------- 点击翻页 / 双击放大 ----------
   * 单击：右半边 → 下一屏，左半边 → 上一屏（与滑动互斥）
   * 双击：放大对应那一页的大图（手机屏小的时候看清内容）
   * 单击要延迟一小会儿再执行，给「双击」留出判定窗口，避免双击时多翻一屏 */
  const DOUBLE_MS = 320;
  let tapTimer = null, lastTap = 0, lastTapX = 0, lastTapY = 0;

  function handleTap(x, y) {
    const rect = book.getBoundingClientRect();
    const isRight = x > rect.left + rect.width / 2;
    const now = Date.now();
    const isDouble = (now - lastTap < DOUBLE_MS) &&
                     Math.abs(x - lastTapX) < 48 && Math.abs(y - lastTapY) < 48;
    if (isDouble) {
      clearTimeout(tapTimer); tapTimer = null;
      lastTap = 0;
      const s = screens[spread] || {};
      if (s.solo) openLightbox(itm(s.l >= 0 ? s.l : s.r));
      else openLightbox(isRight ? itm(s.r) : itm(s.l));
      return;
    }
    lastTap = now; lastTapX = x; lastTapY = y;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => {
      tapTimer = null;
      if (isRight) goNext(); else goPrev();
    }, DOUBLE_MS);
  }

  /* ---------- 双击放大（全屏查看） ---------- */
  let lbZoomed = false;
  function setLbZoom(on) {
    lbZoomed = !!on;
    lightbox.classList.toggle('zoomed', lbZoomed);
    const hint = lightbox.querySelector('.lb-hint');
    if (hint) hint.textContent = lbZoomed ? '点图片还原 · 点右上角 ✕ 关闭' : '点图片可放大细看 · 点空白处关闭';
  }
  function openLightbox(item) {
    if (!item || !item.src) { showToast('这一侧没有图片'); return; }
    if (autoOn) { autoOn = false; toggleAuto.classList.remove('on'); stopAuto(); }
    setLbZoom(false);
    lightboxImg.src = item.src;
    lightboxImg.alt = item.name || '';
    lightbox.classList.add('show');
    document.body.classList.add('lb-open'); // 临时放开 touch-action，放大后能拖动查看
    lightbox.scrollTop = 0; lightbox.scrollLeft = 0;
  }
  function closeLightbox() {
    lightbox.classList.remove('show');
    setLbZoom(false);
    lightboxImg.removeAttribute('src');
    document.body.classList.remove('lb-open');
  }
  /* 点图片 → 在「适应屏幕 / 原始尺寸」之间切换，方便看清细节；
   * 点空白处或 ✕ → 关闭。
   * 说明：本站 no-zoom.js 全局禁用了捏合缩放，所以自带一个放大档位。 */
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightboxImg) { setLbZoom(!lbZoomed); return; }
    closeLightbox();
  });

  /* ---------- 下载 ---------- */
  btnDownload.addEventListener('click', () => {
    // 下载当前屏左页那张（没有则右页）
    const s = screens[spread] || {};
    const idx = (s.l >= 0) ? s.l : ((s.r >= 0) ? s.r : -1);
    if (idx < 0 || !images[idx]) { showToast('当前页不可下载'); return; }
    const a = document.createElement('a');
    a.href = images[idx].src;
    a.download = images[idx].name || `画册-${idx + 1}.jpg`;
    a.click();
  });

  /* ---------- Toast ---------- */
  function showToast(msg) {
    let t = document.querySelector('.toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  /* ---------- 对外接口：供 album-share.js 打包成单文件 / 发布分享链接 ---------- */
  window.__album = {
    getImages: () => images,          // [{ src, name, w, h, el }]
    count: () => images.length,
    getAR: () => bookAR,
    isBookOpen: () => bookStage.classList.contains('show'),
    showToast: showToast,
  };
})();
