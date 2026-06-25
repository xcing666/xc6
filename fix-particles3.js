const fs = require('fs');
const path = 'C:/Users/GCF/Desktop/1111111111/网站/script.js';
let js = fs.readFileSync(path, 'utf8');

if (!js.includes('function initAmbient()')) {
  const insert = `

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
    js = js.slice(0, idx) + 'resizeCanvas();' + insert + '\n/* 主动画循环 */' + js.slice(idx + marker.length);
    console.log('Added initAmbient');
  } else {
    console.log('Marker not found');
  }
} else {
  console.log('Already has initAmbient');
}

fs.writeFileSync(path, js, 'utf8');
console.log('Done');
