#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

async function main() {
  const [,, filePath, docId='image-doc-1', url = 'http://localhost:3000/api/upload'] = process.argv;
  if (!filePath) {
    console.error('Usage: node scripts/upload-image.js <path-to-image> [docId] [url]');
    process.exit(2);
  }

  const filename = path.basename(filePath);
  const mime = guessMime(filename);
  const fileBuf = fs.readFileSync(filePath);

  const boundary = '--------------------------' + Date.now().toString(16);
  const parts = [];

  parts.push(Buffer.from(`--${boundary}\r\n`));
  parts.push(Buffer.from(`Content-Disposition: form-data; name="file"; filename="${filename}"\r\n`));
  parts.push(Buffer.from(`Content-Type: ${mime}\r\n\r\n`));
  parts.push(fileBuf);
  parts.push(Buffer.from('\r\n'));

  parts.push(Buffer.from(`--${boundary}\r\n`));
  parts.push(Buffer.from(`Content-Disposition: form-data; name="docId"\r\n\r\n`));
  parts.push(Buffer.from(docId));
  parts.push(Buffer.from('\r\n'));

  parts.push(Buffer.from(`--${boundary}--\r\n`));

  const body = Buffer.concat(parts);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': String(body.length)
      },
      body
    });

    const text = await res.text();
    console.log('Status:', res.status);
    console.log(text);
  } catch (err) {
    console.error('Upload error', err);
    process.exit(1);
  }
}

function guessMime(filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  if (lower.endsWith('.tif') || lower.endsWith('.tiff')) return 'image/tiff';
  return 'application/octet-stream';
}

main();
