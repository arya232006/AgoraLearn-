#!/usr/bin/env node
const fs = require('fs');
#!/usr/bin/env node
console.warn('Note: image upload scripts are deprecated for the prototype and moved to scripts/experimental/');
console.warn('Run: node scripts/experimental/upload-image-base64.js <path> [docId] [url]');
process.exit(1);

function addBypassQuery(url, token) {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}x-vercel-set-bypass-cookie=true&x-vercel-protection-bypass=${encodeURIComponent(token)}`;
}

main();
