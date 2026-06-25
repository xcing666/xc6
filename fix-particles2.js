const fs = require('fs');
const path = 'C:/Users/GCF/Desktop/1111111111/网站/script.js';
let js = fs.readFileSync(path, 'utf8');

// 1. 替换声明，添加 ambientParticles
if (!js.includes('ambientParticles = []')) {
  js = js.replace(
    'let ctx, W, H, particles = [], animId;',
    'let ctx, W, H, particles = [], ambientParticles = [], animId, ambientTime = 0;'
  );
  console.log('Step 1: added ambientParticles declaration');
} else {
  console.log('Step 1: already has ambientParticles');
}

// 2. 在 Particle 类之后添加 AmbientParticle 类
if (!js.includes('function AmbientParticle()')) {
  const ambientClass = `/* 环境跳动粒子（常驻少量） */
function AmbientParticle() {
  this.reset();
}
AmbientParticle.prototype.reset = function() {
  this.x = Math.random() * window.innerWidth;
  this.y = Math.random() * window.innerHeight;
  this.baseY = this.y;
  this.size = 8 + Math.random() * 10;
  this.speed = 0.5 + Math.random() * 1.5;
  this.phase = Math.random() * Math.PI * 2;
  this.amp = 8 + Math.random() * 20;
  this.drift = (Math.random() - 0.5) * 0.3;
  this.rot = Math.random() * Math.PI * 2;
  this.rotSpeed = (Math.random() - 0.5) * 0.015;
  this.alpha = 0.25 + Math.random() * 0.35;
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
  ctx.font = this.size + 'px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(this.icon, 0, 0);
  ctx.restore();
};
`;
  // Find the end of Particle.draw() and insert after it
  const marker = 'ctx.restore();\n};\n\n\n\n/* 初始化画布尺寸 */';
  const idx = js.indexOf(marker);
  if (idx !== -1) {
    js = js.slice(0, idx) + 'ctx.restore();\n};\n\n' + ambientClass + '\n\n/* 初始化画布尺寸 */' + js.slice(idx + marker.length);
    console.log('Step 2: added AmbientParticle class');
  } else {
    console.log('Step 2: marker not found, trying alternative...');
    // Try alternative marker
    const altMarker = 'ctx.restore();\n};';
    const lastRestore = js.lastIndexOf(altMarker);
    if (lastRestore !== -1) {
      const insertAfter = lastRestore + altMarker.length;
      js = js.slice(0, insertAfter) + '\n\n' + ambientClass + '\n' + js.slice(insertAfter);
      console.log('Step 2: added AmbientParticle class (alt)');
    }
  }
} else {
  console.log('Step 2: already has AmbientParticle');
}

// 3. 在 resizeCanvas 后添加环境粒子初始化
if (!js.includes('function initAmbient()')) {
  const initAmbient = `

/* 初始化环境粒子（少量常驻） */
function initAmbient() {
  ambientParticles = [];
  const count = window.innerWidth < 768 ? 10 : 18;
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
`;
  const marker = 'resizeCanvas();\n\n/* 主动画循环 */';
  const idx = js.indexOf(marker);
  if (idx !== -1) {
    js = js.slice(0, idx) + 'resizeCanvas();' + initAmbient + '\n\n/* 主动画循环 */' + js.slice(idx + marker.length);
    console.log('Step 3: added initAmbient');
  } else {
    console.log('Step 3: marker not found');
  }
} else {
  console.log('Step 3: already has initAmbient');
}

// 4. 修改 animate 函数
const oldAnimate = `function animate() {
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => { p.update(); p.draw(); });
  if (particles.length > 0) {
    animId = requestAnimationFrame(animate);
  } else {
    cancelAnimationFrame(animId);
    animId = null;
  }
}`;

const newAnimate = `function animate() {
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  ambientTime += 0.016;
  ambientParticles.forEach(p => { p.update(); p.draw(); });
  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => { p.update(); p.draw(); });
  animId = requestAnimationFrame(animate);
}`;

if (js.includes(oldAnimate)) {
  js = js.replace(oldAnimate, newAnimate);
  console.log('Step 4: replaced animate function');
} else {
  console.log('Step 4: old animate not found exactly, trying loose match...');
  // Try to find and replace with regex-like approach
  const startIdx = js.indexOf('function animate() {');
  const endIdx = js.indexOf('function ensureLoop() {');
  if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
    js = js.slice(0, startIdx) + newAnimate + '\n' + js.slice(endIdx);
    console.log('Step 4: replaced animate function (loose)');
  } else {
    console.log('Step 4: could not find animate boundaries');
  }
}

fs.writeFileSync(path, js, 'utf8');
console.log('Done!');
