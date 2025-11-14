// Node helper to upload a URL once and query it, with optional docId reuse.
// Usage examples:
//   node scripts/study-url-query.js "https://en.wikipedia.org/wiki/Newton%27s_laws_of_motion" "Explain Newton's three laws..."
//   node scripts/study-url-query.js "https://..." "Question" existing-doc-id
//   node scripts/study-url-query.js --help

const API_BASE = process.env.AGORA_API_BASE || 'https://agora-learn-uv27.vercel.app';

function printUsage() {
  console.log('Usage:');
  console.log('  node scripts/study-url-query.js <url> <question> [docId]');
  console.log('  AGORA_API_BASE can override the default API base URL.');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  if (args.length < 2) {
    console.error('Error: url and question are required.');
    printUsage();
    process.exit(1);
  }

  const [url, question, existingDocId] = args;

  let docId = existingDocId;

  if (!docId) {
    console.log('Uploading URL to AgoraLearn backend...');
    const uploadResp = await fetch(`${API_BASE}/api/upload-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    if (!uploadResp.ok) {
      console.error('Upload failed with status', uploadResp.status, await uploadResp.text());
      process.exit(1);
    }

    const uploadJson = await uploadResp.json();
    if (!uploadJson.ok) {
      console.error('Upload failed:', uploadJson);
      process.exit(1);
    }

    docId = uploadJson.docId;
    console.log('Upload ok. docId =', docId, 'chunksInserted =', uploadJson.chunksInserted);
  } else {
    console.log('Reusing existing docId =', docId, 'for URL =', url);
  }

  console.log('Asking question...');

  const queryResp = await fetch(`${API_BASE}/api/converse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: question, docId }),
  });

  if (!queryResp.ok) {
    console.error('Query failed with status', queryResp.status, await queryResp.text());
    process.exit(1);
  }

  const queryJson = await queryResp.json();

  console.log('\nAnswer:\n');
  console.log(queryJson.answer);

  if (Array.isArray(queryJson.chunks)) {
    console.log('\nTop chunks (doc_id + first 160 chars):');
    for (const c of queryJson.chunks.slice(0, 5)) {
      const id = c.doc_id || c.docId || '(no-doc-id)';
      const text = (c.text || '').replace(/\s+/g, ' ').slice(0, 160);
      console.log(`- ${id}: ${text}`);
    }
  }
}

main().catch((err) => {
  console.error('study-url-query error:', err);
  process.exit(1);
});
