import { supabase } from './index.js';

interface GrammarTopic {
  classLevel: string;
  topicName: string;
  description: string;
}

const hindiGrammarTopics: GrammarTopic[] = [
  // Class 10 Topics
  { classLevel: 'Class 10', topicName: 'वाक्य परिवर्तन (2 अंक)', description: 'Hindi Grammar: Sentence Transformation (सरल, संयुक्त, और मिश्र वाक्य) [2 Marks].' },
  { classLevel: 'Class 10', topicName: 'अनेकार्थी शब्द (2 अंक)', description: 'Hindi Grammar: Homonyms / Words with multiple meanings [2 Marks].' },
  { classLevel: 'Class 10', topicName: 'सहायक क्रिया (2 अंक)', description: 'Hindi Grammar: Auxiliary verbs identification and usage [2 Marks].' },
  { classLevel: 'Class 10', topicName: 'विशेषण बनाना (1 अंक)', description: 'Hindi Grammar: Adjective formation from nouns and verbs [1 Mark].' },
  { classLevel: 'Class 10', topicName: 'भाववाचक संज्ञा बनाना (1 अंक)', description: 'Hindi Grammar: Abstract noun formation [1 Mark].' },
  { classLevel: 'Class 10', topicName: 'विलोमार्थी शब्द (2 अंक)', description: 'Hindi Grammar: Antonyms / Opposite words [2 Marks].' },
  { classLevel: 'Class 10', topicName: 'पर्यायवाची शब्द (2 अंक)', description: 'Hindi Grammar: Synonyms [2 Marks].' },
  { classLevel: 'Class 10', topicName: 'मुहावरों का अर्थ और वाक्यों में प्रयोग (4 अंक)', description: 'Hindi Grammar: Idiom meanings and sentence usage [4 Marks].' },
  { classLevel: 'Class 10', topicName: 'निबंध लेखन (6 अंक)', description: 'Hindi Writing: Essay writing [6 Marks].' },
  { classLevel: 'Class 10', topicName: 'कहानी लेखन (5 अंक)', description: 'Hindi Writing: Story writing [5 Marks].' },
  { classLevel: 'Class 10', topicName: 'पत्र लेखन (5 अंक)', description: 'Hindi Writing: Formal and Informal Letter writing [5 Marks].' },
  { classLevel: 'Class 10', topicName: 'अपठित गद्यखंड (10 अंक)', description: 'Hindi Reading: Reading comprehension passage [10 Marks].' },
  { classLevel: 'Class 10', topicName: 'अपठित गद्यखंड (6 अंक)', description: 'Hindi Reading: Reading comprehension passage [6 Marks].' },

  // Class 9 Topics
  { classLevel: 'Class 9', topicName: 'वर्ण-विच्छेद (2 अंक)', description: 'Hindi Grammar: Letter and Phoneme splitting [2 Marks].' },
  { classLevel: 'Class 9', topicName: 'संधि-विच्छेद (2 अंक)', description: 'Hindi Grammar: Sandhi joining and splitting [2 Marks].' },
  { classLevel: 'Class 9', topicName: 'पर्यायवाची शब्द (1 अंक)', description: 'Hindi Grammar: Synonyms [1 Mark].' },
  { classLevel: 'Class 9', topicName: 'मुहावरे (3 अंक)', description: 'Hindi Grammar: Idiom usage [3 Marks].' },
  { classLevel: 'Class 9', topicName: 'विलोम शब्द (2 अंक)', description: 'Hindi Grammar: Antonyms [2 Marks].' },
  { classLevel: 'Class 9', topicName: 'काल (2 अंक)', description: 'Hindi Grammar: Tense identification and transformation [2 Marks].' },
  { classLevel: 'Class 9', topicName: 'कारक (2 अंक)', description: 'Hindi Grammar: Case markers / Karaka identification [2 Marks].' },
  { classLevel: 'Class 9', topicName: 'उपसर्ग (1 अंक)', description: 'Hindi Grammar: Prefixes [1 Mark].' },
  { classLevel: 'Class 9', topicName: 'प्रत्यय (1 अंक)', description: 'Hindi Grammar: Suffixes [1 Mark].' },
  { classLevel: 'Class 9', topicName: 'अनेकार्थी / भिन्नार्थक शब्द (2 अंक)', description: 'Hindi Grammar: Words with multiple meanings / similar sounding distinct words [2 Marks].' },
  { classLevel: 'Class 9', topicName: 'अव्यय (2 अंक)', description: 'Hindi Grammar: Indeclinables (अव्यय / अविकारी शब्द) [2 Marks].' },
  { classLevel: 'Class 9', topicName: 'भाववाचक संज्ञा (2 अंक)', description: 'Hindi Grammar: Abstract Nouns [2 Marks].' },
  { classLevel: 'Class 9', topicName: 'विशेषण बनाना (2 अंक)', description: 'Hindi Grammar: Adjective formation [2 Marks].' },
  { classLevel: 'Class 9', topicName: 'वाक्य शुद्ध (2 अंक)', description: 'Hindi Grammar: Sentence Correction [2 Marks].' },
  { classLevel: 'Class 9', topicName: 'मुहावरे MCQ (2 अंक)', description: 'Hindi Grammar: Idioms MCQ questions [2 Marks].' },
  { classLevel: 'Class 9', topicName: 'पर्यायवाची शब्द MCQ (2 अंक)', description: 'Hindi Grammar: Synonyms MCQ questions [2 Marks].' },
  { classLevel: 'Class 9', topicName: 'वाक्य प्रकार (2 अंक)', description: 'Hindi Grammar: Sentence types [2 Marks].' },
  { classLevel: 'Class 9', topicName: 'सहायक क्रिया (2 अंक)', description: 'Hindi Grammar: Auxiliary verbs [2 Marks].' },
  { classLevel: 'Class 9', topicName: 'समदर्शी भिन्नार्थक शब्द (2 अंक)', description: 'Hindi Grammar: Similar sounding words with different meanings [2 Marks].' },
  { classLevel: 'Class 9', topicName: 'पत्र लेखन अनौपचारिक (5 अंक)', description: 'Hindi Writing: Informal letter writing [5 Marks].' },
  { classLevel: 'Class 9', topicName: 'पत्र लेखन औपचारिक/अनौपचारिक (5 अंक)', description: 'Hindi Writing: Formal / Informal letter writing [5 Marks].' },
  { classLevel: 'Class 9', topicName: 'कहानी लेखन (5 अंक)', description: 'Hindi Writing: Story writing [5 Marks].' },
  { classLevel: 'Class 9', topicName: 'संवाद लेखन (5 अंक)', description: 'Hindi Writing: Dialogue writing [5 Marks].' },
  { classLevel: 'Class 9', topicName: 'निबंध लेखन (6 अंक)', description: 'Hindi Writing: Essay writing [6 Marks].' },
  { classLevel: 'Class 9', topicName: 'अपठित गद्य-खंड (8 अंक)', description: 'Hindi Reading: Reading comprehension passage [8 Marks].' },
  { classLevel: 'Class 9', topicName: 'अपठित गद्य-खंड MCQ (6 अंक)', description: 'Hindi Reading: MCQ Reading comprehension passage [6 Marks].' }
];

async function seed() {
  console.log('Seeding updated Hindi Grammar topics into Supabase...');

  // Delete existing Hindi Grammar chapters to ensure clean list
  await supabase.from('chapters').delete().eq('subject', 'Hindi Grammar');

  for (const item of hindiGrammarTopics) {
    const { data: newChapter, error: chapErr } = await supabase
      .from('chapters')
      .insert({
        subject: 'Hindi Grammar',
        class: item.classLevel,
        board: 'CBSE',
        chapter_name: item.topicName,
        summary: {
          topics: [item.topicName],
          important_terms: ['व्याकरण नियम', 'उदाहरण', 'अभ्यास'],
          key_points: [item.description]
        }
      })
      .select('id')
      .single();

    if (chapErr) {
      console.error(`Failed to insert chapter ${item.topicName}:`, chapErr.message);
      continue;
    }

    const { error: chunkErr } = await supabase.from('chunks').insert({
      chapter_id: newChapter.id,
      chunk_title: item.topicName,
      chunk_content: `Hindi Grammar Topic: ${item.topicName}.\n${item.description}\nGemini will generate fresh exam questions, exercises, and examples for this topic.`,
      chunk_order: 1,
      chunk_type: 'theory'
    });

    if (chunkErr) {
      console.error(`Failed to insert chunk for ${item.topicName}:`, chunkErr.message);
    } else {
      console.log(`Inserted chapter & chunk: ${item.topicName} (${item.classLevel})`);
    }
  }

  console.log('Finished seeding all updated Hindi Grammar topics!');
}

seed().catch((err) => {
  console.error('Error during seeding:', err);
  process.exit(1);
});
