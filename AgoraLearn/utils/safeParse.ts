import type { VercelRequest } from '@vercel/node';

export async function safeParseJson(req: VercelRequest): Promise<any | undefined> {
  try {
    if (req.body && typeof req.body === 'object') return req.body;
  } catch (e) {
    // fallthrough to raw read
  }

  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    // If request already emitted 'data' events this will not receive them —
    // we only use this when req.body wasn't populated by Vercel.
    req.on('data', (d: Buffer) => chunks.push(d));
    req.on('end', () => {
      try {
        const txt = Buffer.concat(chunks).toString('utf8').trim();
        if (!txt) return resolve(undefined);
        const parsed = JSON.parse(txt);
        return resolve(parsed);
      } catch (e) {
        return resolve(undefined);
      }
    });
    req.on('error', () => resolve(undefined));
  });
}
