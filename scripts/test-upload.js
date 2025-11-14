// Use Node 18+ global fetch instead of node-fetch

async function main() {
  const body = {
    text: "This is my first study document about Newton's laws of motion.",
    docId: "physics-notes-1",
  };

  // Allow sending to protected deployment by setting VERCEL_BYPASS_TOKEN env
  const envBypass = process.env.VERCEL_BYPASS_TOKEN;
  const urlBase = process.env.AGORA_API_BASE || 'http://localhost:3000';
  const target = envBypass
    ? `${urlBase}/api/upload?x-vercel-set-bypass-cookie=true&x-vercel-protection-bypass=${encodeURIComponent(envBypass)}`
    : `${urlBase}/api/upload`;

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
