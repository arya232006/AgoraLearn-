(async () => {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
      process.exit(1);
    }
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const docId = process.argv[2] || 'vector-calc-1';
    console.log('Querying supabase for doc_id=', docId);
    const { data, error } = await supabase.from('chunks').select('id,doc_id,text').eq('doc_id', docId).limit(50);
    if (error) {
      console.error('Supabase error:', error);
      process.exit(1);
    }
    console.log('Rows found:', Array.isArray(data) ? data.length : 0);
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Script error:', e);
    process.exit(1);
  }
})();
