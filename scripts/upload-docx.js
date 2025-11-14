// Usage: node scripts/upload-docx.js path/to/file.docx [docId]

const fs = require('fs');
const path = require('path');

const API_BASE = process.env.AGORA_API_BASE || 'https://agora-learn-uv27.vercel.app';

async function main() {
  const [filePath, docId] = process.argv.slice(2);
  if (!filePath) {
    console.error('Usage: node scripts/upload-docx.js path/to/file.docx [docId]');
    process.exit(1);
  }

  const abs = path.resolve(filePath);
  const data = fs.readFileSync(abs);
  const fileBase64 = data.toString('base64');

  const body = { fileBase64 };
  if (docId) body.docId = docId;

  const res = await fetch(`${API_BASE}/api/upload-doc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error('upload-doc failed:', res.status, await res.text());
    process.exit(1);
  }

  const json = await res.json();
  console.log(json);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
