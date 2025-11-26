import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { uid, password, email, mobile } = req.body;
  if (!uid || !password || (!email && !mobile)) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Use email for Supabase Auth, store UID/mobile in profile
  const authEmail = email || `${mobile}@agoralearn.local`;

  // Register user in Supabase Auth
  const { data, error } = await supabase.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true,
    user_metadata: { uid, mobile }
  });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  // Optionally, insert into a user profile table
  await supabase.from('profiles').insert({
    id: data.user.id,
    uid,
    email: authEmail,
    mobile
  });

  return res.status(200).json({ user: data.user });
}
