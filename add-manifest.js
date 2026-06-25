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
  if (content.includes('rel="manifest"')) return;
  const idx = content.indexOf('<link rel="icon"');
  if (idx === -1) return;
  const insertIdx = content.indexOf('>', idx) + 1;
  const link = `\n  <link rel="manifest" href="${manifest}" />`;
  content = content.slice(0, insertIdx) + link + content.slice(insertIdx);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Manifest link added: ${file}`);
});

console.log('Done');
