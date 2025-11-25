const fs = require('fs');
const path = require('path');

(async () => {
  try {
    const filePath = process.argv[2] || 'C:\\Users\\ARYADEEP\\Downloads\\Vector Calculus - Intro-DOT Product.pdf';
    const docId = process.argv[3] || 'vector-calc-1';
    const urlUpload = 'http://localhost:3000/api/upload';
    const urlConverse = 'http://localhost:3000/api/converse';

    console.log('Reading file:', filePath);
    const bytes = fs.readFileSync(filePath);
    const b64 = bytes.toString('base64');
    const payload = { fileBase64: b64, filename: path.basename(filePath), docId };

    console.log('Posting to /api/upload...');
    const upRes = await fetch(urlUpload, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const upText = await upRes.text();
    console.log('/api/upload ->', upRes.status, upText);

    if (upRes.ok) {
      console.log('Posting to /api/converse...');
      const qPayload = { query: 'Summarize the document.', docId };
      const cq = await fetch(urlConverse, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(qPayload)
      });
      const cqText = await cq.text();
      console.log('/api/converse ->', cq.status, cqText);
    } else {
      console.log('Upload failed; skipping converse.');
    }
  } catch (e) {
    console.error('Script error:', e);
    process.exitCode = 1;
  }
})();
