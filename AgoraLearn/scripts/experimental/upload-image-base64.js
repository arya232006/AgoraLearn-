#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

async function main() {
  const [,, filePath, docId='image-doc-1', url = 'http://localhost:3000/api/upload'] = process.argv;
  if (!filePath) {
    console.error('Usage: node scripts/upload-image-base64.js <path-to-image> [docId] [url]');
    process.exit(2);
  }

  const filename = path.basename(filePath);
  const lower = filename.toLowerCase();
  let mime = 'application/octet-stream';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) mime = 'image/jpeg';
  if (lower.endsWith('.png')) mime = 'image/png';
  if (lower.endsWith('.gif')) mime = 'image/gif';
  if (lower.endsWith('.bmp')) mime = 'image/bmp';
  if (lower.endsWith('.tif') || lower.endsWith('.tiff')) mime = 'image/tiff';

  const fileBuf = fs.readFileSync(filePath);
  const fileBase64 = fileBuf.toString('base64');
  const payload = {
    fileBase64: `data:${mime};base64,${fileBase64}`,
    filename,
    mimeType: mime,
    docId
  };
  console.log('Uploading', filename, '(', (fileBuf.length / 1024).toFixed(1), 'KB ) to', url);

  try {
    // Add a timeout so the script doesn't hang indefinitely
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // 60s

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeout);
    const text = await res.text();
    console.log('Status:', res.status);
    console.log(text);
    // If server rejects JSON content type, try multipart/form-data as a fallback
    if (res.status === 400 && String(text).toLowerCase().includes('unsupported content type')) {
      console.warn('Server rejected JSON payload; retrying with multipart/form-data...');
      // build multipart body similar to upload-image.js
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
        const res2 = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': String(body.length)
          },
          body
        });
        const text2 = await res2.text();
        console.log('Retry Status:', res2.status);
        console.log(text2);
      } catch (err2) {
        console.error('Multipart retry error', err2);
        process.exit(1);
      }
    }
  } catch (err) {
    console.error('Upload error', err);
    process.exit(1);
  }
}

main();
