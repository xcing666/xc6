/* =============================================
   兴程网络 — 交互脚本（含粒子画布系统）
   ============================================= */
/* 标记 JS 已加载，触发 CSS 滚动揭示动画 */
document.body.classList.add('js-loaded');

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

/* ============ 打字机效果 ============ */
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
      if (ci >= full.length) { deleting = true; setTimeout(tick, 2000); return; }
      setTimeout(tick, 90 + Math.random() * 50);
    } else {
      ci--;
      el.textContent = full.slice(0, ci);
      if (ci <= 0) { deleting = false; ti = (ti + 1) % texts.length; setTimeout(tick, 350); return; }
      setTimeout(tick, 40);
    }
  }
  tick();
}
initTyping();

/* ============ 数字跳动动画（showcase 统计数据）============ */
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

/* ============ 滚动进度条 ============ */
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

/* ============ 回到顶部 ============ */
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

/* ============ Toast 提示 ============ */
function showToast(msg, dur = 2800) {
  const toast = document.getElementById('toast');
  if (!toast) { alert(msg); return; }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { toast.classList.remove('show'); }, dur);
}

/* ============ 复制文本工具 ============ */
function copyText(txt, label) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(txt).then(() => showToast('✅ ' + label + ' 已复制：' + txt));
  } else {
    const ta = document.createElement('textarea');
    ta.value = txt; document.body.appendChild(ta);
    ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('✅ ' + label + ' 已复制：' + txt);
  }
}
window.copyText = copyText;

/* ============ 滚动揭示（补充新元素）============ */
function initRevealExtra() {
  const els = document.querySelectorAll('.reveal');
  if (!els.length) return;
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        setTimeout(() => entry.target.classList.add('visible'), i * 80);
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  els.forEach(el => obs.observe(el));
}
initRevealExtra();

/* ============ 虚假评论滚动（design 页）============ */
function initFakeComments() {
  var container = document.getElementById('fakeComments');
  if (!container) return;
  if (container.querySelectorAll('.fake-comment-item').length > 0) return;

  var names  = ['张*','李*','王*','刘*','陈*','杨*','赵*','黄*','周*','吴*','徐*','孙*','马*','朱*','胡*','郭*'];
  var actions = [
    '下单了<span class="fc-action">海报</span>',
    '买了<span class="fc-action">Logo</span>',
    '咨询了<span class="fc-action">VI全套</span>',
    '下单了<span class="fc-action">包装</span>',
    '买了<span class="fc-action">名片</span>',
    '咨询了<span class="fc-action">画册</span>',
    '下单了<span class="fc-action">宣传单</span>',
    '买了<span class="fc-action">展会物料</span>',
  ];
  var times = ['刚刚','1分钟前','3分钟前','5分钟前','8分钟前','15分钟前','30分钟前'];
  var stars = ['\u2b50\u2b50\u2b50\u2b50\u2b50','\u2b50\u2b50\u2b50\u2b50'];

  function makeHtml() {
    return names[Math.floor(Math.random()*names.length)] +
      ' ' + actions[Math.floor(Math.random()*actions.length)] +
      (Math.random()>0.4?' <span class="fc-star">'+stars[0]+'</span>':'') +
      ' <span class="fc-time">'+times[Math.floor(Math.random()*times.length)]+'</span>';
  }

  var items = [];

  for (var i = 0; i < 40; i++) {
    var el = document.createElement('div');
    el.className = 'fake-comment-item';
    el.innerHTML = makeHtml();

    var left   = 1 + Math.random() * 92;
    var top    = 18 + Math.random() * 74;   /* 避开标题区 */
    var rotEnd = (Math.random()-0.5) * 36;
    var rotStart = (Math.random()-0.5) * 120;
    var sc = 0.75 + Math.random() * 0.55;

    el.style.left = left + '%';
    el.style.top  = top + '%';
    el.style.zIndex = Math.floor(Math.random()*10)+1;
    el.style.setProperty('--rot-start', rotStart.toFixed(1)+'deg');
    el.style.setProperty('--rot-end',   rotEnd.toFixed(1)+'deg');
    el.style.setProperty('--scale',     sc.toFixed(2));

    var floatIdx = (i % 5) + 1;
    var animDur   = (5 + Math.random()*7).toFixed(1);
    var animDelay = ((i*130)%2200).toFixed(0);
    var popDelay  = (i*90 + Math.random()*400).toFixed(0);
    el.style.animation =
      'fc-pop-in 0.65s cubic-bezier(.34,1.56,.64,1) ' + popDelay + 'ms forwards,' +
      'fc-float-' + floatIdx + ' ' + animDur + 's ease-in-out ' + animDelay + 'ms infinite';

    items.push(el);
    container.appendChild(el);
  }

  /* ===== 灵动跳动器 ===== */
  (function startJitter() {
    var intervalId = null;

    function jumpSome() {
      if (!document.body || !document.body.contains(container)) {
        clearInterval(intervalId);
        return;
      }
      /* 每次随机跳 2~6 个 */
      var count = 2 + Math.floor(Math.random() * 5);
      for (var j = 0; j < count; j++) {
        var idx = Math.floor(Math.random() * items.length);
        var it  = items[idx];
        if (!it || !it.parentElement) continue;

        var rLeft = 1 + Math.random() * 92;
        var rTop  = 18 + Math.random() * 74;
        var rRot  = (Math.random()-0.5) * 36;
        var rSc   = 0.75 + Math.random() * 0.55;

        it.style.left = rLeft + '%';
        it.style.top  = rTop + '%';
        it.style.setProperty('--rot-end', rRot.toFixed(1)+'deg');
        it.style.setProperty('--scale',   rSc.toFixed(2));
        it.style.zIndex = Math.floor(Math.random()*10)+1;

        /* 偶尔加个发光效果，0.8秒后消失 */
        if (Math.random() > 0.6) {
          it.classList.add('fc-glow');
          setTimeout((function(el){ return function(){ el.classList.remove('fc-glow'); }; })(it), 800);
        }
      }

      /* 偶尔让一个气泡短暂消失再出现 */
      if (Math.random() > 0.5) {
        var hideIdx = Math.floor(Math.random() * items.length);
        var hItem   = items[hideIdx];
        if (hItem && hItem.parentElement) {
          hItem.style.opacity = '0';
          hItem.style.transform = 'scale(0)';
          setTimeout((function(el){ return function(){
            el.style.opacity = '1';
            el.style.transform = '';
          }; })(hItem), 600+Math.random()*1200);
        }
      }

      clearInterval(intervalId);
      intervalId = setInterval(jumpSome, 2000 + Math.random()*2200);
    }

    setTimeout(jumpSome, 1200);
  })();
}

/* 多重保险 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFakeComments);
} else {
  initFakeComments();
}
window.addEventListener('load', function(){ setTimeout(initFakeComments, 300); });

function initCasesAccordion() {
  document.querySelectorAll('.case-acc-header').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.parentElement;
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.case-acc-item.open').forEach(o => o.classList.remove('open'));
      if (!isOpen) item.classList.add('open');
    });
  });
}
initCasesAccordion();
