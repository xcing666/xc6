const fs = require('fs');
const path = require('path');

const base = 'C:/Users/GCF/Desktop/1111111111/网站';

const files = [
  { file: '404.html', icon: '🚀', manifest: 'manifest.json' },
  { file: 'social-media.html', icon: '🚀', manifest: 'manifest.json' },
  { file: 'pdd-assist.html', icon: '🚀', manifest: 'manifest.json' },
  { file: 'design/index.html', icon: '🚀', manifest: '../manifest.json' },
  { file: 'design/ai-culling.html', icon: '🚀', manifest: '../manifest.json' },
  { file: 'miniprogram/index.html', icon: '🚀', manifest: '../manifest.json' },
  { file: 'tools/index.html', icon: '🛠️', manifest: '../manifest.json' },
  { file: 'tools/image-convert.html', icon: '🖼️', manifest: '../manifest.json' },
  { file: 'tools/qrcode.html', icon: '📱', manifest: '../manifest.json' },
  { file: 'tools/color.html', icon: '🎨', manifest: '../manifest.json' },
  { file: 'tools/font.html', icon: '🔤', manifest: '../manifest.json' },
  { file: 'tools/image-compress.html', icon: '🗜️', manifest: '../manifest.json' },
  { file: 'tools/price.html', icon: '💰', manifest: '../manifest.json' }
];

files.forEach(({ file, icon, manifest }) => {
  const filePath = path.join(base, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // 查找被破坏的 favicon 模式（跨两行）
  const pattern = new RegExp(
    `<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www\\.w3\\.org/2000/svg' viewBox='0 0 64 64'>\\s*` +
    `<link rel="manifest" href="[^"]+" /><text y='56' font-size='56'>${icon}</text></svg>" />`,
    'g'
  );
  
  const replacement = 
    `<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><text y='56' font-size='56'>${icon}</text></svg>" />\n` +
    `  <link rel="manifest" href="${manifest}" />`;
  
  const newContent = content.replace(pattern, replacement);
  if (newContent !== content) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log(`Fixed favicon: ${file}`);
  } else {
    console.log(`Skip (no match): ${file}`);
  }
});

console.log('Done');
