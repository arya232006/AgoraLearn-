(async () => {
  try {
    const pdfUrl = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
    const uploadPayload = { url: pdfUrl, docId: 'pdf-test-1' };
    console.log('Posting URL to /api/upload...', pdfUrl);
    const up = await fetch('http://localhost:3000/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(uploadPayload)
    });
    const upText = await up.text();
    console.log('/api/upload ->', up.status, upText);

    const queryPayload = { query: 'what is this document about?', docId: 'pdf-test-1' };
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
