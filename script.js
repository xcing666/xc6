/* =============================================
   兴程网络 — 交互脚本（含粒子画布系统）
   ============================================= */

/* =========== 微信环境检测（兜底） ===========
   GitHub Pages 主站(xcing666.github.io/xc6)在微信内常被拦截，
   统一跳转到未被封的入口域名 xcing.ldt3.top 的引导页。
   引导页再提示客户用外部浏览器打开 GitHub Pages 主站。 =========== */
(function () {
  var ua = navigator.userAgent || '';
  var isWeixin = /MicroMessenger|WeChat/i.test(ua);
  if (!isWeixin || /weixin-guide\.html/.test(location.pathname)) return;
  var entry = 'https://xcing.ldt3.top/weixin-guide.html?target=' + encodeURIComponent(location.href);
  location.replace(entry);
})();

/* =========== 节流函数 =========== */
function throttle(fn, delay) {
  var last = 0, timer = null;
  return function() {
    var ctx = this, args = arguments, now = Date.now();
    if (now - last >= delay) {
      clearTimeout(timer);
      last = now;
      fn.apply(ctx, args);
    } else {
      clearTimeout(timer);
      timer = setTimeout(function() { last = now; fn.apply(ctx, args); }, delay - (now - last));
    }
  };
}


/* =========== 复制到剪贴板 (P0 修复) =========== */
window.copyText = function(text, btn) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function() {
      if (btn) { var o = btn.textContent; btn.textContent = '已复制 ✓'; setTimeout(function(){ btn.textContent = o; }, 1500); }
    }).catch(function() { fallbackCopy(text, btn); });
  } else {
    fallbackCopy(text, btn);
  }
};
function fallbackCopy(text, btn) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); if (btn) { var o = btn.textContent; btn.textContent = '已复制 ✓'; setTimeout(function(){ btn.textContent = o; }, 1500); } } catch(e) {}
  document.body.removeChild(ta);
}

/* 标记 JS 已加载，触发 CSS 滚动揭示动画 */
document.body.classList.add('js-loaded');


/* =========== 粒子画布系统（仅首页） =========== */
const canvas = document.getElementById('particle-canvas');
let ctx, W, H, particles = [], ambientParticles = [], animId, ambientTime = 0;
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

/* 粒子类定义 */
function Particle(x, y, icons) {
  this.x = x;
  this.y = y;
  const iconArr = Array.isArray(icons) ? icons : [icons];
  this.icon = iconArr[Math.floor(Math.random() * iconArr.length)];
  this.size = 16 + Math.random() * 18;
  this.vx = (Math.random() - 0.5) * 8;
  this.vy = (Math.random() - 1) * 8 - 2;
  this.life = 1;
  this.decay = 0.008 + Math.random() * 0.012;
  this.rot = Math.random() * Math.PI * 2;
  this.rotSpeed = (Math.random() - 0.5) * 0.2;
  this.gravity = 0.15;
}
Particle.prototype.update = function() {
  this.x += this.vx;
  this.y += this.vy;
  this.vy += this.gravity;
  this.vx *= 0.98;
  this.rot += this.rotSpeed;
  this.life -= this.decay;
};
Particle.prototype.draw = function() {
  if (this.life <= 0) return;
  ctx.save();
  ctx.translate(this.x, this.y);
  ctx.rotate(this.rot);
  ctx.globalAlpha = Math.max(0, this.life);
  ctx.fillStyle = "rgba(255,255,255," + Math.max(0, this.life) + ")";
  ctx.font = this.size + 'px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(this.icon, 0, 0);
  ctx.restore();
};

/* 环境跳动粒子（常驻少量） */
function AmbientParticle() {
  this.reset();
}
AmbientParticle.prototype.reset = function() {
  this.x = Math.random() * window.innerWidth;
  this.y = Math.random() * window.innerHeight;
  this.baseY = this.y;
  this.size = 12 + Math.random() * 8;
  this.speed = 0.5 + Math.random() * 1.5;
  this.phase = Math.random() * Math.PI * 2;
  this.amp = 8 + Math.random() * 20;
  this.drift = (Math.random() - 0.5) * 0.3;
  this.rot = Math.random() * Math.PI * 2;
  this.rotSpeed = (Math.random() - 0.5) * 0.015;
  this.alpha = 0.4 + Math.random() * 0.3;
  const icons = ['✨','◆','●','◇','▪','·','⭑','💫','◉','⬟'];
  this.icon = icons[Math.floor(Math.random() * icons.length)];
};
AmbientParticle.prototype.update = function() {
  this.x += this.drift;
  this.baseY += this.drift * 0.5;
  this.y = this.baseY + Math.sin(ambientTime * this.speed + this.phase) * this.amp;
  this.rot += this.rotSpeed;
  if (this.x < -20) this.x = window.innerWidth + 20;
  if (this.x > window.innerWidth + 20) this.x = -20;
  if (this.baseY < -40) this.baseY = window.innerHeight + 40;
  if (this.baseY > window.innerHeight + 40) this.baseY = -40;
};
AmbientParticle.prototype.draw = function() {
  ctx.save();
  ctx.translate(this.x, this.y);
  ctx.rotate(this.rot);
  ctx.globalAlpha = this.alpha;
  ctx.fillStyle = 'rgba(255,255,255,' + this.alpha + ')';
  ctx.shadowBlur = 12;
  ctx.shadowColor = 'rgba(255,255,255,0.6)';
  ctx.font = this.size + 'px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(this.icon, 0, 0);
  ctx.restore();
};





/* 初始化画布尺寸 */
function resizeCanvas() {
  W = canvas.width  = window.innerWidth  * DPR;
  H = canvas.height = window.innerHeight * DPR;
  canvas.style.width  = window.innerWidth  + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', throttle(function() { resizeCanvas(); }, 200));
resizeCanvas();

/* 初始化环境粒子（少量常驻） */
function initAmbient() {
  ambientParticles = [];
  const count = window.innerWidth < 768 ? 8 : 15;
  for (let i = 0; i < count; i++) {
    ambientParticles.push(new AmbientParticle());
  }
}
initAmbient();
window.addEventListener('resize', throttle(initAmbient, 500));

/* 页面可见性控制：切后台暂停动画 */
document.addEventListener('visibilitychange', function() {
  if (document.hidden && animId) {
    cancelAnimationFrame(animId);
    animId = null;
  } else if (!document.hidden) {
    ensureLoop();
  }
});

/* 主动画循环 */
function animate() {
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  ambientTime += 0.016;
  ambientParticles.forEach(p => { p.update(); p.draw(); });
  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => { p.update(); p.draw(); });
  animId = requestAnimationFrame(animate);
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
    for (let i = 0; i < 8; i++) {
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
  /* Issue 13: 移动端菜单点击链接后自动关闭 */
  navMenu.querySelectorAll("a").forEach(function(link) {
    link.addEventListener("click", function() {
      navMenu.classList.remove("open");
      navHam.classList.remove("active");
    });
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
    var sp1=document.createElement('span');sp1.className='fc-name';sp1.textContent=m.name;
    var sp2=document.createElement('span');sp2.className='fc-action';sp2.textContent=m.action;
    var sp3=document.createElement('span');sp3.className='fc-item-name';sp3.textContent=m.item;
    var sp4=document.createElement('span');sp4.className='fc-time';sp4.textContent=m.time;
    div.appendChild(sp1);div.appendChild(sp2);div.appendChild(sp3);div.appendChild(sp4);
    el.appendChild(div);

    // 最多保留 MAX_ON_SCREEN 条，避免无限累积
    while (el.children.length > MAX_ON_SCREEN) el.removeChild(el.firstChild);

    idx++;
    setTimeout(showNext, delay);
  }
  showNext();
}

/* =========== 案例图片墙（点击放大）========== */
(function() {
  const viewer = document.getElementById('caseViewer');
  const vImg = document.getElementById('caseViewerImg');
  const vCap = document.getElementById('caseViewerCaption');
  if (!viewer || !vImg) return;

  // 点击墙上的任意图片 → 放大查看
  document.getElementById('casesWall')?.addEventListener('click', function(e) {
    const tile = e.target.closest('.case-piece');
    if (!tile) return;
    const img = tile.querySelector('img');
    if (!img) return;
    vImg.src = img.src;
    vCap.textContent = img.alt || '案例作品';
    viewer.classList.add('show');
    document.body.style.overflow = 'hidden';
  });

  // 关闭查看器
  window.closeCaseViewer = function(e) {
    if (e && e.target !== viewer && !e.target.classList.contains('case-viewer-close')) return;
    viewer.classList.remove('show');
    document.body.style.overflow = '';
  };

  // ESC 关闭
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && viewer.classList.contains('show')) {
      viewer.classList.remove('show');
      document.body.style.overflow = '';
    }
  });
})();

/* ========== 固定比例缩放 + 自动裁切溢出 ========== */
(function() {
  var scaler = document.getElementById('casesScale');
  if (!scaler) return;
  var DESIGN_W = 1180;

  function fitScale() {
    var wrap = scaler.parentElement;
    var availW = (wrap ? wrap.clientWidth : window.innerWidth) - 12;

    if (availW >= DESIGN_W) {
      scaler.style.cssText = 'width:' + DESIGN_W + 'px;transform:none;zoom:1;';
      wrap.style.paddingBottom = '0';
    } else {
      var s = availW / DESIGN_W;
      scaler.style.width = DESIGN_W + 'px';
      scaler.style.zoom = s;
      scaler.style.transform = 'none';
      wrap.style.paddingBottom = '0';
    }

    /* 裁切：锁定Grid容器高度，超出部分hidden */
    var wall = document.getElementById('casesWall');
    if (wall && wall.offsetHeight > 0) {
      // 取实际高度的95%，确保边框内不溢出
      wall.style.maxHeight = Math.floor(wall.offsetHeight * 0.96) + 'px';
      wall.style.overflow = 'hidden';
    }
  }

  window.addEventListener('resize', throttle(fitScale, 200));
  window.addEventListener('load', function() {
    setTimeout(fitScale, 200);
  });
  setTimeout(fitScale, 300);
})();

initFakeComments();

/* ========== 页脚分组展开/收起 ========== */
function toggleFooterGroup(titleEl) {
  var group = titleEl.parentElement;
  group.classList.toggle('active');
}

/* ========== 二维码弹窗 ========== */
function showQRCode(type) {
  var modal = document.getElementById('qrModal');
  var title = document.getElementById('qrTitle');
  var content = document.getElementById('qrContent');
  
  if (type === 'wechat') {
    title.textContent = '微信扫码';
    content.innerHTML = '<img src="wechat-qrcode.png" alt="微信二维码" style="width:220px;height:220px;border-radius:12px;display:block;margin:0 auto;" /><p style="margin-top:16px;font-size:13px;color:var(--text-dim);text-align:center;">微信扫一扫添加好友</p>';
  } else if (type === 'qq') {
    title.textContent = 'QQ联系方式';
    content.innerHTML = '<p>QQ号：738874448</p><p style="margin-top:12px;font-size:12px;color:var(--text-dim);">请添加QQ号咨询</p>';
  } else if (type === 'email') {
    title.textContent = '邮箱联系方式';
    content.innerHTML = '<p>邮箱：738874448@qq.com</p><p style="margin-top:12px;font-size:12px;color:var(--text-dim);">请发送邮件咨询</p>';
  }
  
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeQRModal() {
  var modal = document.getElementById('qrModal');
  modal.classList.remove('active');
  document.body.style.overflow = '';
}

/* 点击弹窗背景关闭 */
document.addEventListener('DOMContentLoaded', function() {
  var modal = document.getElementById('qrModal');
  if (modal) {
    modal.addEventListener('click', function(e) {
      if (e.target === modal) {
        closeQRModal();
      }
    });
  }
});

/* ESC关闭弹窗 */
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    closeQRModal();
  }
});
