// Use Node 18+ global fetch instead of node-fetch

async function main() {
  const body = {
    query: "What are Newton's laws of motion?",
  };

  const urlBase = process.env.AGORA_API_BASE || 'http://localhost:3000';
  const target = `${urlBase}/api/converse`;

  const res = await fetch(target, {
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
