const fs = require('fs');
const path = require('path');

const base = 'C:/Users/GCF/Desktop/1111111111/网站';

const V = '25062516';
const favicon = "<link rel=\"icon\" href=\"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><text y='56' font-size='56'>🚀</text></svg>\" />";

function read(file) { return fs.readFileSync(path.join(base, file), 'utf8'); }
function write(file, content) { fs.writeFileSync(path.join(base, file), content, 'utf8'); }

// ========== 1. 统一版本号 ==========
function updateVersion(file, relPath) {
  let content = read(file);
  // 替换 style.css 和 script.js 的版本号
  content = content.replace(/style\.css\?v=[^"']+/g, `style.css?v=${V}`);
  content = content.replace(/script\.js\?v=[^"']+/g, `script.js?v=${V}`);
  // 替换 ../style.css 的版本号
  content = content.replace(/\.\.\/style\.css\?v=[^"']+/g, `../style.css?v=${V}`);
  content = content.replace(/\.\.\/script\.js\?v=[^"']+/g, `../script.js?v=${V}`);
  // tools 子页面可能有不同版本
  content = content.replace(/\.\.\/style\.css\?v=20260624[ac]/g, `../style.css?v=${V}`);
  write(file, content);
  console.log(`Version updated: ${file}`);
}

// ========== 2. 添加 favicon ==========
function addFavicon(file) {
  let content = read(file);
  if (content.includes('rel="icon"')) return;
  const idx = content.indexOf('<title>');
  if (idx === -1) return;
  const insertIdx = content.indexOf('</title>', idx) + 8;
  content = content.slice(0, insertIdx) + '\n  ' + favicon + content.slice(insertIdx);
  write(file, content);
  console.log(`Favicon added: ${file}`);
}

// ========== 3. 添加 meta description ==========
function addDescription(file, desc) {
  let content = read(file);
  if (content.includes('name="description"')) return;
  const idx = content.indexOf('<meta name="viewport"');
  if (idx === -1) return;
  const insertIdx = content.indexOf('>', idx) + 1;
  const tag = `\n  <meta name="description" content="${desc}" />`;
  content = content.slice(0, insertIdx) + tag + content.slice(insertIdx);
  write(file, content);
  console.log(`Description added: ${file}`);
}

// ========== 4. 导航栏添加 AI 智能选图 ==========
function addNavLink(file, href) {
  let content = read(file);
  if (content.includes('AI智能选图')) return;
  const idx = content.indexOf('<li><a href="tools/');
  if (idx === -1) return;
  const insertIdx = content.lastIndexOf('<li>', idx);
  const link = `        <li><a href="${href}">AI智能选图</a></li>\n`;
  content = content.slice(0, insertIdx) + link + content.slice(insertIdx);
  write(file, content);
  console.log(`Nav link added: ${file}`);
}

// ========== 5. 添加回到顶部按钮 ==========
function addBackToTop(file) {
  let content = read(file);
  if (content.includes('backToTop')) return;
  const idx = content.lastIndexOf('</body>');
  if (idx === -1) return;
  const btn = '\n  <button class="back-to-top" id="backToTop" title="回到顶部">↑</button>\n';
  content = content.slice(0, idx) + btn + content.slice(idx);
  write(file, content);
  console.log(`Back-to-top added: ${file}`);
}

// ========== 6. 添加页脚（简化版） ==========
function addFooter(file, rootPrefix) {
  let content = read(file);
  if (content.includes('class="footer"')) return;
  const idx = content.lastIndexOf('</body>');
  if (idx === -1) return;
  const footer = `\n  <footer class="footer" style="padding:40px 24px;text-align:center;background:var(--bg-deep);border-top:1px solid rgba(255,255,255,.06);position:relative;z-index:1;">\n    <p style="color:rgba(255,255,255,.4);font-size:13px;">© 2026 <span style="color:var(--c1);font-weight:700;">兴程网络</span> · 保留所有权利</p>\n  </footer>\n`;
  content = content.slice(0, idx) + footer + content.slice(idx);
  write(file, content);
  console.log(`Footer added: ${file}`);
}

// ========== 执行 ==========

// 统一版本号
const allFiles = [
  'index.html', '404.html', 'social-media.html', 'pdd-assist.html',
  'design/index.html', 'miniprogram/index.html', 'tools/index.html',
  'tools/image-convert.html', 'tools/qrcode.html', 'tools/color.html',
  'tools/font.html', 'tools/image-compress.html', 'tools/price.html'
];
allFiles.forEach(f => {
  try { updateVersion(f); } catch(e) { console.log(`Skip version ${f}: ${e.message}`); }
});

// 添加 favicon
const noFavicon = ['design/index.html', 'miniprogram/index.html', 'social-media.html', 'pdd-assist.html', 'design/ai-culling.html'];
noFavicon.forEach(f => {
  try { addFavicon(f); } catch(e) { console.log(`Skip favicon ${f}: ${e.message}`); }
});

// 添加 description
const descMap = {
  'design/index.html': '兴程网络广告平面设计服务 — 海报设计、品牌VI、宣传册、电商主图、社交媒体配图，专业设计团队一对一服务。',
  'miniprogram/index.html': '兴程网络微信小程序开发服务 — 电商商城、企业展示、预约系统、餐饮外卖，定制化开发，源码交付。',
  'social-media.html': '兴程网络社交媒体运营服务 — 短视频代运营、粉丝增长、内容策划，助力品牌全网曝光。',
  'pdd-assist.html': '兴程网络拼多多助力服务 — 砍价助力、现金红包、好友助力，快速完成助力任务。',
  'design/ai-culling.html': 'AI 智能选图工具 — 基于 TensorFlow MobileNet 模型，自动识别图片内容并智能筛选，提升选图效率。',
  'tools/image-convert.html': '免费在线图片格式转换工具 — 支持 JPG/PNG/WEBP/GIF 互转，批量转换，无需安装软件。',
  'tools/qrcode.html': '免费在线二维码生成器 — 支持网址、文本、名片、WiFi 等多种类型，自定义样式与颜色。',
  'tools/color.html': '免费在线配色方案生成工具 — 输入关键词或选择风格，AI 生成品牌配色方案。',
  'tools/font.html': '免费在线字体预览工具 — 输入文字，实时预览多种字体效果，支持字号与颜色调整。',
  'tools/image-compress.html': '免费在线图片压缩工具 — 批量压缩 JPG/PNG/WEBP，自定义压缩比例，保持画质。',
  'tools/price.html': '免费在线设计报价计算器 — 选择设计类型与需求，自动估算市场价格，方便报价参考。'
};
Object.entries(descMap).forEach(([f, desc]) => {
  try { addDescription(f, desc); } catch(e) { console.log(`Skip description ${f}: ${e.message}`); }
});

// 导航栏添加 AI 智能选图
addNavLink('design/index.html', '../design/ai-culling.html');
addNavLink('miniprogram/index.html', '../design/ai-culling.html');
addNavLink('social-media.html', 'design/ai-culling.html');
addNavLink('pdd-assist.html', 'design/ai-culling.html');
addNavLink('tools/index.html', '../design/ai-culling.html');

// 添加回到顶部按钮
const pagesWithBackToTop = [
  'design/index.html', 'miniprogram/index.html', 'social-media.html', 'pdd-assist.html',
  'tools/index.html', 'tools/image-convert.html', 'tools/qrcode.html', 'tools/color.html',
  'tools/font.html', 'tools/image-compress.html', 'tools/price.html'
];
pagesWithBackToTop.forEach(f => {
  try { addBackToTop(f); } catch(e) { console.log(`Skip back-to-top ${f}: ${e.message}`); }
});

// 添加页脚（简单版）
const pagesWithFooter = [
  'design/index.html', 'miniprogram/index.html', 'social-media.html', 'pdd-assist.html',
  'tools/image-convert.html', 'tools/qrcode.html', 'tools/color.html',
  'tools/font.html', 'tools/image-compress.html', 'tools/price.html'
];
pagesWithFooter.forEach(f => {
  try { addFooter(f); } catch(e) { console.log(`Skip footer ${f}: ${e.message}`); }
});

console.log('Batch fixes done!');
