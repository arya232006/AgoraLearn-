// Use Node 18+ global fetch instead of node-fetch

async function main() {
  const body = {
    text: "This is my first study document about Newton's laws of motion.",
    docId: "physics-notes-1",
  };

  const res = await fetch('http://localhost:3000/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  console.log('Status:', res.status);
  console.log('Body:', text);
}

main().catch((err) => {
  console.error('Request failed:', err);
  process.exit(1);
});
