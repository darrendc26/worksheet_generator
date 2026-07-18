const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkDb() {
  console.log("Checking chapters in DB...");
  const { data: chapters, error: chapError } = await supabase
    .from('chapters')
    .select('id, chapter_name, subject, class, board, created_at');
  
  if (chapError) {
    console.error("Error fetching chapters:", chapError);
    return;
  }
  
  console.log(`Found ${chapters.length} chapters:`);
  for (const c of chapters) {
    const { count, error: countError } = await supabase
      .from('chunks')
      .select('*', { count: 'exact', head: true })
      .eq('chapter_id', c.id);
      
    console.log(`- [${c.id}] Name: "${c.chapter_name}", Subject: "${c.subject}", Class: "${c.class}", Board: "${c.board}", Chunks count: ${countError ? 'error' : count}`);
  }
}

checkDb();
