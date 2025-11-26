import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req, res) {
  // Example protected endpoint
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Missing token' });
  }

  try {
    // Verify Supabase JWT
    const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET!);
    // ...proceed with protected logic...
    return res.status(200).json({ message: 'Access granted', user: decoded });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
