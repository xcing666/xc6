/* =============================================
   兴程网络 — 交互脚本（含粒子画布系统）
   ============================================= */

/* ============ 粒子画布系统 ============ */
const canvas = document.getElementById('particle-canvas');
const ctx    = canvas.getContext('2d');

let W, H, particles = [], animId;
const DPR = Math.min(window.devicePixelRatio || 1, 2);

/* 各服务对应的粒子图标 */
const SERVICE_ICONS = {
  design:     ['🎨','🖼️','📱','📘','✏️','🎨','🖌️'],
  miniprogram: ['📱','💬','🛒','⚙️','📲','🔔','📋'],
  social:      ['📈','⭐','💬','📊','📹️','🔥','💡'],
  pdd:         ['💰','🎁','✅','🤝','🏷️','🧧','🎯'],
};

class Particle {
  constructor(x, y, icons) {
    this.x = x;  this.y = y;
    this.icon = icons[Math.floor(Math.random() * icons.length)];
    this.size = 16 + Math.random() * 14;
    this.speedX = (Math.random() - 0.5) * 3.5;
    this.speedY = -1.8 - Math.random() * 3.5;
    this.life  = 1;
    this.decay = 0.008 + Math.random() * 0.015;
    this.rotation = Math.random() * 360;
    this.rotSpeed = (Math.random() - 0.5) * 4;
    this.gravity = 0.02 + Math.random() * 0.03;
  }
  update() {
    this.x += this.speedX;
    this.y += this.speedY;
    this.speedY += this.gravity;
    this.life  -= this.decay;
    this.rotation += this.rotSpeed;
  }
  draw() {
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life);
    ctx.translate(this.x, this.y);
    ctx.rotate((this.rotation * Math.PI) / 180);
    ctx.font = `${this.size}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.icon, 0, 0);
    ctx.restore();
  }
}

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

/* ============ 导航滚动效果 ============ */
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 50);
});

/* ============ 移动端菜单 ============ */
const navHam  = document.getElementById('navHam');
const navMenu = document.getElementById('navMenu');
navHam.addEventListener('click', () => {
  navMenu.classList.toggle('open');
  navHam.classList.toggle('active');
});

/* ============ 滚动入场动画 (IntersectionObserver) ============ */
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

/* ============ 卡片悬停 3D 倾斜效果 ============ */
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

/* ============ 数字滚动（子页面可调用）============ */
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

/* ============ 数字滚动动画（showcase 统计数据）============ */
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
