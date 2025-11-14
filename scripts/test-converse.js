const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

async function main() {
  const body = {
    query: "What are Newton's laws of motion?",
  };

  const res = await fetch('http://localhost:3000/api/converse', {
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
