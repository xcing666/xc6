const fs = require('fs');
const path = require('path');

const base = 'C:/Users/GCF/Desktop/1111111111/网站';

const files = [
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
  
  // 查找跨行被破坏的 favicon
  const lines = content.split(/\r?\n/);
  let fixed = false;
  
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim();
    const nextLine = lines[i + 1].trim();
    if (line.startsWith('<link rel="icon"') && line.endsWith("viewBox='0 0 64 64'>") &&
        nextLine.includes('<link rel="manifest"') && nextLine.includes('</text></svg>" />')) {
      // 提取 emoji
      const emojiMatch = nextLine.match(/>([^<]+)<\/text>/);
      const emoji = emojiMatch ? emojiMatch[1] : '🚀';
      lines[i] = `  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><text y='56' font-size='56'>${emoji}</text></svg>" />`;
      lines[i + 1] = `  <link rel="manifest" href="${manifest}" />`;
      fixed = true;
      break;
    }
  }
  
  if (fixed) {
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    console.log(`Fixed favicon: ${file}`);
  } else {
    console.log(`Skip (no match): ${file}`);
  }
});

console.log('Done');
