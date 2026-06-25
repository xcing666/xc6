const fs = require('fs');
const path = require('path');

const base = 'C:/Users/GCF/Desktop/1111111111/网站';

const files = [
  { file: 'index.html', manifest: 'manifest.json' },
  { file: '404.html', manifest: 'manifest.json' },
  { file: 'social-media.html', manifest: 'manifest.json' },
  { file: 'pdd-assist.html', manifest: 'manifest.json' },
  { file: 'design/index.html', manifest: '../manifest.json' },
  { file: 'design/ai-culling.html', manifest: '../manifest.json' },
  { file: 'miniprogram/index.html', manifest: '../manifest.json' },
  { file: 'tools/index.html', manifest: '../manifest.json' },
  { file: 'tools/image-convert.html', manifest: '../manifest.json' },
  { file: 'tools/qrcode.html', manifest: '../manifest.json' },
  { file: 'tools/color.html', manifest: '../manifest.json' },
  { file: 'tools/font.html', manifest: '../manifest.json' },
  { file: 'tools/image-compress.html', manifest: '../manifest.json' },
  { file: 'tools/price.html', manifest: '../manifest.json' }
];

files.forEach(({ file, manifest }) => {
  const filePath = path.join(base, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // 修复被破坏的 favicon：将跨行的 favicon + manifest 合并为一行
  const brokenPattern = /<link rel="icon"[^>]*>\s*<link rel="manifest"[^>]*>/;
  if (brokenPattern.test(content)) {
    const iconMatch = content.match(/<link rel="icon"[^>]*>/);
    if (iconMatch) {
      const iconTag = iconMatch[0].replace(/\s+/g, ' ').trim();
      const manifestTag = `\n  <link rel="manifest" href="${manifest}" />`;
      content = content.replace(brokenPattern, iconTag + manifestTag);
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Fixed favicon: ${file}`);
    }
  } else {
    console.log(`Skip (already ok): ${file}`);
  }
});

console.log('Done');
