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
    { name: '张*',   action: '下单了', item: '海报设计', time: '3 分钟前' },
    { name: '李*',   action: '已付款', item: 'Logo 设计', time: '5 分钟前' },
    { name: '王*',   action: '下单了', item: '包装设计', time: '8 分钟前' },
    { name: '陈*',   action: '已付款', item: 'VI 全套',   time: '12 分钟前' },
    { name: '刘*',   action: '下单了', item: '宣传单',   time: '15 分钟前' },
    { name: '赵*',   action: '已付款', item: '画册设计', time: '18 分钟前' },
    { name: '孙*',   action: '下单了', item: '电商详情', time: '22 分钟前' },
    { name: '周*',   action: '已付款', item: '菜单设计', time: '25 分钟前' },
    { name: '吴*',   action: '下单了', item: '展架设计', time: '28 分钟前' },
    { name: '郑*',   action: '已付款', item: 'Logo 改版', time: '32 分钟前' },
  ];

  let idx = 0;

  function getRandomPos() {
    const rect = el.getBoundingClientRect();
    const w = rect.width || 900;
    const h = rect.height || 260;
    // 随机位置，确保在容器内
    const left = 20 + Math.random() * (w - 180);
    const top  = 40 + Math.random() * (h - 60);
    return { left: left + 'px', top: top + 'px' };
  }

  function showNext() {
    const m = msgs[idx % msgs.length];
    const pos = getRandomPos();
    const delay = 3500 + Math.random() * 4000; // 3.5~7.5 秒随机间隔
    const floatIdx = (idx % 5) + 1; // 1~5，对应 CSS 的 fc-float-1 ~ fc-float-5

    const div = document.createElement('div');
    div.className = 'fake-comment-item';
    div.style.cssText = `
      left: ${pos.left};
      top:  ${pos.top};
      --rot-start: ${(Math.random() * 20 - 10).toFixed(1)}deg;
      --rot-end:   ${(Math.random() * 12 - 6).toFixed(1)}deg;
      --scale:      ${ (0.85 + Math.random() * 0.3).toFixed(2) };
      --float-dur:  ${ (4 + Math.random() * 3).toFixed(1) }s;
      --float-delay: ${ (Math.random() * 1).toFixed(2) }s;
      animation: fc-pop-in 0.7s cubic-bezier(.34,1.56,.64,1) both,
                 fc-float-${floatIdx} var(--float-dur) var(--float-delay) ease-in-out infinite;
    `;
    div.innerHTML = `<span class="fc-name">${m.name}</span><span class="fc-action">${m.action}</span><span class="fc-item-name">${m.item}</span><span class="fc-time">${m.time}</span>`;
    el.appendChild(div);

    // 只保留最近 6 条
    while (el.children.length > 6) el.removeChild(el.firstChild);

    idx++;
    setTimeout(showNext, delay);
  }
  showNext();
}
initFakeComments();
