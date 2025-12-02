(async () => {
  try {
    const uploadPayload = {
      text: "Mitochondria are the powerhouse of the cell. They generate ATP via oxidative phosphorylation.",
      docId: "test-doc-1"
    };

    console.log('Posting to /api/upload...', JSON.stringify(uploadPayload));
    const up = await fetch('http://localhost:3000/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(uploadPayload)
    });
    const upText = await up.text();
    console.log('/api/upload ->', up.status, upText);

    const queryPayload = { query: 'what is the powerhouse of the cell?', docId: 'test-doc-1' };
    console.log('Posting to /api/converse...', JSON.stringify(queryPayload));
    const cq = await fetch('http://localhost:3000/api/converse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(queryPayload)
    });
    const cqText = await cq.text();
    console.log('/api/converse ->', cq.status, cqText);
  } catch (e) {
    console.error('Test script error:', e);
    process.exitCode = 1;
  }
})();
