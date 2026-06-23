/* =============================================
   兴程网络 — 交互脚本（含粒子画布系统）
   ============================================= */
/* 标记 JS 已加载，触发 CSS 滚动揭示动画 */
document.body.classList.add('js-loaded');

/* =========== 粒子画布系统（仅首页） =========== */
const canvas = document.getElementById('particle-canvas');
let ctx, W, H, particles = [], animId;
if (canvas) {
  ctx = canvas.getContext('2d');
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

/* 各服务对应的粒子图标 */
const SERVICE_ICONS = {
  design:     ['🎨','🖼️','📐','📏','✏️','🎨','🖌️'],
  miniprogram: ['📱','💬','🛒','⚙️','📲','🔔','📋'],
  social:      ['📈','⭐','💬','📊','📹️','🔥','💡'],
  pdd:         ['💰','🎁','✅','🤝','🏷️','🧧','🎯'],
};

/* 初始化画布尺寸 */
function resizeCanvas() {
  W = canvas.width  = window.innerWidth  * DPR;
  H = canvas.height = window.innerHeight * DPR;
  canvas.style.width  = window.innerWidth  + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.scale(DPR, DPR);
}
window.addEventListener('resize', () => { resizeCanvas(); });
resizeCanvas();

/* 主动画循环 */
function animate() {
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => { p.update(); p.draw(); });
  if (particles.length > 0) {
    animId = requestAnimationFrame(animate);
  } else {
    cancelAnimationFrame(animId);
    animId = null;
  }
}
function ensureLoop() {
  if (!animId) animate();
}

/* 卡片悬停 → 喷射粒子 */
document.querySelectorAll('.service-card').forEach(card => {
  let lastEmit = 0;
  card.addEventListener('mouseenter', () => {
    const rect = card.getBoundingClientRect();
    const service = card.dataset.service || 'design';
    const icons = SERVICE_ICONS[service] || SERVICE_ICONS.design;
    for (let i = 0; i < 18; i++) {
      const x = rect.left + Math.random() * rect.width;
      const y = rect.top  + rect.height * 0.3;
      particles.push(new Particle(x, y, icons));
    }
    ensureLoop();
  });
  card.addEventListener('mousemove', e => {
    if (Date.now() - lastEmit < 60) return;
    lastEmit = Date.now();
    const service = card.dataset.service || 'design';
    const icons = SERVICE_ICONS[service] || SERVICE_ICONS.design;
    particles.push(new Particle(e.clientX, e.clientY, icons));
    ensureLoop();
  });
});
} /* end: particle-canvas guard */

/* =========== 导航滚动效果 =========== */
function initNav() {
  const nav = document.getElementById('nav');
  if (nav) {
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 50);
    });
  }
}
initNav();

/* =========== 移动端菜单 =========== */
function initMobileMenu() {
  const navHam  = document.getElementById('navHam');
  const navMenu = document.getElementById('navMenu');
  if (!navHam || !navMenu) return;
  navHam.addEventListener('click', () => {
    navMenu.classList.toggle('open');
    navHam.classList.toggle('active');
  });
}
initMobileMenu();

/* =========== 滚动入场动画 (IntersectionObserver) =========== */
function initReveal() {
  const els = document.querySelectorAll(
    '.reveal, .service-card, .benefit-item, .case-item, .section-head'
  );
  if (!els.length) return;
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        setTimeout(() => entry.target.classList.add('visible'), i * 60);
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  els.forEach(el => { el.classList.add('reveal'); obs.observe(el); });
}
initReveal();

/* =========== 卡片悬停 3D 倾斜效果 =========== */
document.querySelectorAll('.service-card, .case-item').forEach(card => {
  card.addEventListener('mousemove', e => {
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width  - 0.5;
    const y = (e.clientY - r.top)  / r.height - 0.5;
    const pull = card.classList.contains('case-item') ? 4 : 10;
    card.style.transform =
      `translateY(-${pull}px) ` +
      `perspective(800px) rotateY(${x*6}deg) rotateX(${-y*6}deg)`;
  });
  card.addEventListener('mouseleave', () => { card.style.transform = ''; });
});

/* =========== 数字滚动（子页面可调用）============ */
window.animateCount = function(el, target, dur = 1500) {
  let s = 0, t = dur / 16;
  const step = target / t;
  const id = setInterval(() => {
    s += step;
    if (s >= target) { s = target; clearInterval(id); }
    el.textContent = Math.floor(s).toLocaleString();
  }, 16);
};

console.log('%c兴程网络 · 多彩粒子版已加载 ✦', 'color:#00cec9;font-size:13px;font-weight:bold;');

/* =========== 打字机效果 =========== */
function initTyping() {
  const el = document.querySelector('.typing-target');
  if (!el) return;
  const texts = ['用技术驱动创意', '让创意改变未来', '为品牌赋能加速', '专注数字服务'];
  let ti = 0, ci = 0, deleting = false;

  function tick() {
    const full = texts[ti];
    if (!deleting) {
      ci++;
      el.textContent = full.slice(0, ci);
      if (ci >= full.length) { deleting = true; setTimeout(tick, 1600); return; }
      setTimeout(tick, 80);
    } else {
      ci--;
      el.textContent = full.slice(0, ci);
      if (ci <= 0) { deleting = false; ti = (ti + 1) % texts.length; setTimeout(tick, 300); return; }
      setTimeout(tick, 35);
    }
  }
  tick();
}
initTyping();

/* =========== 数字跳动动画（showcase 统计数据）============ */
function initCountUp() {
  const statNums = document.querySelectorAll('.stat-num, .data-num');
  if (!statNums.length) return;
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const target = parseInt(el.dataset.target, 10);
        if (!el.dataset.counted) {
          el.dataset.counted = '1';
          window.animateCount(el, target, 2000);
        }
        obs.unobserve(el);
      }
    });
  }, { threshold: 0.3 });
  statNums.forEach(el => obs.observe(el));
}
initCountUp();

/* =========== 滚动进度条 =========== */
function initScrollProgress() {
  const bar = document.getElementById('scrollProgress');
  if (!bar) return;
  window.addEventListener('scroll', () => {
    const h = document.documentElement.scrollHeight - window.innerHeight;
    const pct = h > 0 ? (window.scrollY / h) * 100 : 0;
    bar.style.width = pct + '%';
  }, { passive: true });
}
initScrollProgress();

/* =========== 回到顶部 =========== */
function initBackToTop() {
  const btn = document.getElementById('backToTop');
  if (!btn) return;
  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 400);
  }, { passive: true });
  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}
initBackToTop();

/* =========== 实时订单动态（广告设计页 · 彩色跳动版） =========== */
function initFakeComments() {
  const el = document.getElementById('fakeComments');
  if (!el) return;

  const msgs = [
    // ===== 真实历史订单（固定在屏幕上）=====
    { name: '张*',   action: '下单了', item: '海报设计',   time: '6月22号' },
    { name: '李*',   action: '已付款', item: 'Logo 设计',  time: '6月20号' },
    { name: '王*',   action: '下单了', item: '包装设计',   time: '6月18号' },
    { name: '陈*',   action: '已付款', item: 'VI 全套',    time: '6月15号' },
    { name: '刘*',   action: '下单了', item: '宣传单',     time: '6月12号' },
    { name: '赵*',   action: '已付款', item: '画册设计',   time: '6月10号' },
    { name: '孙*',   action: '下单了', item: '电商详情',   time: '6月8号' },
    { name: '周*',   action: '已付款', item: '菜单设计',   time: '6月5号' },
    { name: '吴*',   action: '下单了', item: '展架设计',   time: '6月3号' },
    { name: '郑*',   action: '已付款', item: 'Logo 改版',  time: '6月1号' },
    { name: '何*',   action: '下单了', item: '名片设计',   time: '5月28号' },
    { name: '黄*',   action: '已付款', item: '易拉宝',     time: '5月25号' },
    { name: '林*',   action: '下单了', item: '淘宝主图',   time: '5月22号' },
    { name: '徐*',   action: '已付款', item: '产品拍摄',   time: '5月18号' },
    { name: '马*',   action: '下单了', item: '横幅设计',   time: '5月15号' },
    { name: '朱*',   action: '已付款', item: '门头设计',   time: '5月12号' },

    // ===== 近期订单 =====
    { name: '胡*',   action: '下单了', item: '折页设计',   time: '昨天' },
    { name: '高*',   action: '已付款', item: 'H5 页面',    time: '昨天' },
    { name: '罗*',   action: '下单了', item: '公众号首图', time: '今天' },
    { name: '梁*',   action: '已付款', item: '抖音封面',   time: '今天' },
    { name: '谢*',   action: '下单了', item: '企业画册',   time: '今天' },
    { name: '宋*',   action: '已付款', item: '包装盒',     time: '今天' },

    // ===== 刚刚 / 最近 =====
    { name: '韩*',   action: '下单了', item: '奖杯设计',   time: '1 小时前' },
    { name: '唐*',   action: '已付款', item: '三折页',     time: '2 小时前' },
    { name: '许*',   action: '下单了', item: '工作证',     time: '3 小时前' },
    { name: '邓*',   action: '已付款', item: '抽奖券',     time: '刚刚' },
    { name: '曹*',   action: '下单了', item: '吊旗设计',   time: '刚刚' },
  ];

  let idx = 0;
  const BURST_COUNT = 20;  // 初始爆发条数（快速填满屏幕）
  const MAX_ON_SCREEN = 40; // 屏幕上最多保留条数

  function getRandomPos() {
    const rect = el.getBoundingClientRect();
    const w = rect.width || 900;
    const h = rect.height || 210;
    // 移动端更紧凑，防止溢出
    const isMobile = w < 500;
    const leftMin = isMobile ? w * 0.02 : w * 0.06;
    const leftMax = isMobile ? w * 0.82 : w * 0.88;
    // 气泡分布范围：留足上下边距，防止被截断
    const topMin  = isMobile ? h * 0.08 : h * 0.08;
    const topMax  = isMobile ? h * 0.82 : h * 0.78;
    const left = leftMin + Math.random() * (leftMax - leftMin);
    const top  = topMin  + Math.random() * (topMax - topMin);
    return { left: left + 'px', top: top + 'px' };
  }

  function showNext() {
    const m = msgs[idx % msgs.length];
    const pos = getRandomPos();
    // 前 BURST_COUNT 条快速弹出，之后恢复正常速度
    const isBurst = idx < BURST_COUNT;
    const delay = isBurst ? 300 : (6000 + Math.random() * 6000);
    const floatIdx = (idx % 5) + 1;

    const div = document.createElement('div');
    div.className = 'fake-comment-item';
    div.style.cssText = `
      left: ${pos.left};
      top:  ${pos.top};
      --rot-start: ${(Math.random() * 20 - 10).toFixed(1)}deg;
      --rot-end:   ${(Math.random() * 12 - 6).toFixed(1)}deg;
      --scale:      ${ (0.85 + Math.random() * 0.3).toFixed(2) };
      --float-dur:  ${ (5 + Math.random() * 4).toFixed(1) }s;
      --float-delay: ${ (Math.random() * 1.5).toFixed(2) }s;
      animation: fc-pop-in 0.6s cubic-bezier(.34,1.56,.64,1) both,
                 fc-float-${floatIdx} var(--float-dur) var(--float-delay) ease-in-out infinite;
    `;
    div.innerHTML = `<span class="fc-name">${m.name}</span><span class="fc-action">${m.action}</span><span class="fc-item-name">${m.item}</span><span class="fc-time">${m.time}</span>`;
    el.appendChild(div);

    // 最多保留 MAX_ON_SCREEN 条，避免无限累积
    while (el.children.length > MAX_ON_SCREEN) el.removeChild(el.firstChild);

    idx++;
    setTimeout(showNext, delay);
  }
  showNext();
}
initFakeComments();
