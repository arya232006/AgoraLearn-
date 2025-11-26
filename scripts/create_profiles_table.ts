import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const createProfilesTable = async () => {
  const sql = `
    create table if not exists profiles (
      id uuid primary key references auth.users(id),
      uid text not null,
      email text,
      mobile text,
      created_at timestamp with time zone default now()
    );
  `;

  const { error } = await supabase.rpc('execute_sql', { sql });
  if (error) {
    console.error('Error creating profiles table:', error.message);
  } else {
    console.log('Profiles table created or already exists.');
  }
};

createProfilesTable();
