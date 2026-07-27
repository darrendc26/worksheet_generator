import { supabase } from './index.js';

interface GrammarTopic {
  classLevel: string;
  topicName: string;
  questionType: 'MCQ' | 'VSA' | 'LA' | 'MIXED';
  description: string;
  chunkInstruction: string;
}

const hindiGrammarTopics: GrammarTopic[] = [
  // ==========================================
  // CLASS 10 GOA BOARD CORRECTED EXAM BLUEPRINT
  // ==========================================
  {
    classLevel: 'Class 10',
    topicName: 'सहायक क्रिया वाक्य प्रयोग (MCQ)',
    questionType: 'MCQ',
    description: 'सहायक क्रियाओं के लिए उचित वाक्य विकल्पों में से चुनना (2 अंक)',
    chunkInstruction: 'STRICT FORMAT: Multiple Choice Questions (MCQs with 4 options A, B, C, D). Generate 2 MCQ questions where students select the correct sentence containing the specified auxiliary verb (सहायक क्रिया). [Marks: 2]'
  },
  {
    classLevel: 'Class 10',
    topicName: 'वाक्य प्रकार पहचान (MCQ)',
    questionType: 'MCQ',
    description: 'वाक्य का प्रकार विकल्पों में से चुनना (2 अंक)',
    chunkInstruction: 'STRICT FORMAT: Multiple Choice Questions (MCQs with 4 options A, B, C, D). Generate 2 MCQ questions where students select the correct type of the given sentence (सरल, संयुक्त, मिश्र). [Marks: 2]'
  },
  {
    classLevel: 'Class 10',
    topicName: 'पर्यायवाची शब्द (MCQ)',
    questionType: 'MCQ',
    description: 'दिए गए शब्द का सही पर्यायवाची शब्द चुनना (2 अंक)',
    chunkInstruction: 'STRICT FORMAT: Multiple Choice Questions (MCQs with 4 options A, B, C, D). Generate 2 MCQ questions where students choose the correct synonym (पर्यायवाची शब्द) for a given word. [Marks: 2]'
  },
  {
    classLevel: 'Class 10',
    topicName: 'विशेषण रूप (MCQ)',
    questionType: 'MCQ',
    description: 'शब्द का सही विशेषण रूप चुनना (1 अंक)',
    chunkInstruction: 'STRICT FORMAT: Multiple Choice Questions (MCQs with 4 options A, B, C, D). Generate 1 MCQ question where students select the correct adjective form (विशेषण रूप) of a given noun or verb. [Marks: 1]'
  },
  {
    classLevel: 'Class 10',
    topicName: 'भाववाचक संज्ञा (MCQ)',
    questionType: 'MCQ',
    description: 'शब्द का सही भाववाचक संज्ञा रूप चुनना (1 अंक)',
    chunkInstruction: 'STRICT FORMAT: Multiple Choice Questions (MCQs with 4 options A, B, C, D). Generate 1 MCQ question where students select the correct abstract noun form (भाववाचक संज्ञा) of a given word. [Marks: 1]'
  },
  {
    classLevel: 'Class 10',
    topicName: 'विलोमार्थी शब्द (MCQ)',
    questionType: 'MCQ',
    description: 'शब्द का सही विलोमार्थी शब्द चुनना (2 अंक)',
    chunkInstruction: 'STRICT FORMAT: Multiple Choice Questions (MCQs with 4 options A, B, C, D). Generate 2 MCQ questions where students select the correct antonym (विलोमार्थी शब्द). [Marks: 2]'
  },
  {
    classLevel: 'Class 10',
    topicName: 'भिन्न-भिन्न अर्थ वाक्य प्रयोग (SA)',
    questionType: 'VSA',
    description: 'शब्द का प्रसंगानुसार भिन्न-भिन्न अर्थ स्पष्ट करने के लिए दो अलग-अलग वाक्यों में प्रयोग (2 अंक)',
    chunkInstruction: 'STRICT FORMAT: Short Answer (VSA). Provide a word with multiple meanings (अनेकार्थी शब्द) and ask students to write 2 distinct, meaningful sentences demonstrating both meanings. [Marks: 2]'
  },
  {
    classLevel: 'Class 10',
    topicName: 'मुहावरे अर्थ विकल्प (MCQ)',
    questionType: 'MCQ',
    description: 'मुहावरों के अर्थ का सही विकल्प चुनना (2 अंक)',
    chunkInstruction: 'STRICT FORMAT: Multiple Choice Questions (MCQs with 4 options A, B, C, D). Generate 2 MCQ questions where students select the correct meaning of the given Hindi idioms (मुहावरे). [Marks: 2]'
  },
  {
    classLevel: 'Class 10',
    topicName: 'मुहावरे वाक्य प्रयोग (SA)',
    questionType: 'VSA',
    description: 'मुहावरों का सार्थक तथा स्वतंत्र वाक्य में प्रयोग (2 अंक)',
    chunkInstruction: 'STRICT FORMAT: Short Answer (VSA). Provide Hindi idioms and ask students to construct a meaningful and independent sentence using each. Generate 2 questions. [Marks: 2]'
  },
  {
    classLevel: 'Class 10',
    topicName: 'निबंध लेखन',
    questionType: 'LA',
    description: 'विषयों में से किसी एक विषय पर 100-150 शब्दों में निबंध लेखन (6 अंक)',
    chunkInstruction: 'STRICT FORMAT: Long Answer (LA Essay). Provide 3 relevant essay prompts with outline hints and a 100-150 word limit guidance. [Marks: 6]'
  },
  {
    classLevel: 'Class 10',
    topicName: 'पत्र लेखन',
    questionType: 'LA',
    description: 'सूचनाओं के अनुसार किसी एक पत्र का प्रारूप तैयार करना (5 अंक)',
    chunkInstruction: 'STRICT FORMAT: Long Answer (LA Letter). Provide a formal or informal letter scenario and instruct students to draft the letter format and contents. [Marks: 5]'
  },
  {
    classLevel: 'Class 10',
    topicName: 'कहानी लेखन',
    questionType: 'LA',
    description: 'रूपरेखा के आधार पर कहानी लिखकर उसे उचित शीर्षक तथा सीख लिखना (5 अंक)',
    chunkInstruction: 'STRICT FORMAT: Long Answer (LA Story). Provide a story outline (outline hints) and instruct students to write a story, choose a title (शीर्षक), and moral/ सीख. [Marks: 5]'
  },
  {
    classLevel: 'Class 10',
    topicName: 'अपठित गद्य-खंड प्रश्नोत्तर',
    questionType: 'VSA',
    description: 'अपठित गद्य-खंड को पढ़कर उसके नीचे दिए गए प्रश्नों के उत्तर लिखना (10 अंक)',
    chunkInstruction: 'STRICT FORMAT: Reading Comprehension with Short Answers (VSA). Provide an unseen prose passage (अपठित गद्यांश) followed by 10 short-answer comprehension questions. [Marks: 10]'
  },
  {
    classLevel: 'Class 10',
    topicName: 'अपठित गद्य-खंड बहुविकल्पीय प्रश्न',
    questionType: 'MCQ',
    description: 'अपठित गद्य-खंड को पढ़कर उसके नीचे दिए गए प्रश्नों के उत्तर सही विकल्पों में से चुनना (6 अंक)',
    chunkInstruction: 'STRICT FORMAT: Reading Comprehension with MCQs. Provide an unseen prose passage (अपठित गद्यांश) followed by 6 Multiple Choice Questions with 4 options (A, B, C, D). [Marks: 6]'
  },

  // =========================================
  // CLASS 9 GOA BOARD CORRECTED EXAM BLUEPRINT
  // =========================================
  {
    classLevel: 'Class 9',
    topicName: 'वर्ण-विच्छेद पहचानना / करना',
    questionType: 'MCQ',
    description: 'वर्ण-विच्छेद पहचानना / करना संबंधित प्रश्न (2 अंक)',
    chunkInstruction: 'STRICT FORMAT: Multiple Choice Questions (MCQs with 4 options A, B, C, D). Generate 2 MCQ questions on Hindi Varn-Vichhed (वर्ण-विच्छेद). [Marks: 2]'
  },
  {
    classLevel: 'Class 9',
    topicName: 'संधि-विच्छेद / संधि पद निर्माण',
    questionType: 'MCQ',
    description: 'संधि-विच्छेद / संधि पद निर्माण संबंधित व्याकरण प्रश्न (2 अंक)',
    chunkInstruction: 'STRICT FORMAT: Multiple Choice Questions (MCQs with 4 options A, B, C, D). Generate 2 MCQ questions on Sandhi-Vichhed and Sandhi formation. [Marks: 2]'
  },
  {
    classLevel: 'Class 9',
    topicName: 'कारक भेद एवं कारक चिह्न पूर्ति',
    questionType: 'MCQ',
    description: 'कारक भेद पहचानना एवं कारक चिह्न द्वारा रिक्त स्थान पूर्ति (2 अंक)',
    chunkInstruction: 'STRICT FORMAT: Multiple Choice Questions (MCQs with 4 options A, B, C, D). Generate 2 MCQ questions on Karak identification and case marker fill-in-blanks. [Marks: 2]'
  },
  {
    classLevel: 'Class 9',
    topicName: 'उपसर्ग एवं प्रत्यय चयन',
    questionType: 'MCQ',
    description: 'सही उपसर्ग एवं प्रत्यय चुनकर लिखने संबंधित प्रश्न (2 अंक)',
    chunkInstruction: 'STRICT FORMAT: Multiple Choice Questions (MCQs with 4 options A, B, C, D). Generate 2 MCQ questions on selecting correct prefixes (उपसर्ग) and suffixes (प्रत्यय). [Marks: 2]'
  },
  {
    classLevel: 'Class 9',
    topicName: 'विलोम शब्द चयन',
    questionType: 'MCQ',
    description: 'सही विलोम शब्द विकल्पों में से चुनकर लिखिए (2 अंक)',
    chunkInstruction: 'STRICT FORMAT: Multiple Choice Questions (MCQs with 4 options A, B, C, D). Generate 2 MCQ questions on choosing the correct antonym (विलोम शब्द). [Marks: 2]'
  },
  {
    classLevel: 'Class 9',
    topicName: 'पर्यायवाची एवं काल भेद',
    questionType: 'MIXED',
    description: 'पर्यायवाची शब्द, काल भेद में परिवर्तन, वाक्य का काल भेद लेखन (3 अंक)',
    chunkInstruction: 'FORMAT: Mix of Short Answer (VSA) and MCQs. Generate 3 questions covering Synonyms (पर्यायवाची) and Tense Transformation (काल परिवर्तन). [Marks: 3]'
  },
  {
    classLevel: 'Class 9',
    topicName: 'भिन्न-भिन्न अर्थ वाक्य प्रयोग',
    questionType: 'VSA',
    description: 'प्रसंगानुसार भिन्न-भिन्न अर्थ स्पष्ट करने के लिए दो अलग-अलग वाक्यों में प्रयोग (2 अंक)',
    chunkInstruction: 'STRICT FORMAT: Short Answer (VSA / Sentence Creation). Provide words with multiple meanings (अनेकार्थी शब्द) and ask students to construct 2 distinct sentences demonstrating both meanings. [Marks: 2]'
  },
  {
    classLevel: 'Class 9',
    topicName: 'मुहावरे अर्थ एवं वाक्य प्रयोग',
    questionType: 'VSA',
    description: 'मुहावरे का सही अर्थ एवं स्वतंत्र सार्थक वाक्य प्रयोग (3 अंक)',
    chunkInstruction: 'FORMAT: Short Answer (VSA). Provide Hindi idioms (मुहावरे) and ask students to state the meaning and write an independent meaningful sentence using the idiom. [Marks: 3]'
  },
  {
    classLevel: 'Class 9',
    topicName: 'निबंध लेखन (150-200 शब्द)',
    questionType: 'LA',
    description: 'दिए गए विषय पर 150-200 शब्दों में निबंध लेखन (6 अंक)',
    chunkInstruction: 'STRICT FORMAT: Long Answer (LA / Essay Writing). Provide 3 relevant essay prompts with outline hints and a 150-200 word count requirement. [Marks: 6]'
  },
  {
    classLevel: 'Class 9',
    topicName: 'पत्र का प्रारूप एवं लेखन',
    questionType: 'LA',
    description: 'दिए गए निर्देशानुसार पत्र का प्रारूप तैयार करना (5 अंक)',
    chunkInstruction: 'STRICT FORMAT: Long Answer (LA / Letter Writing). Provide a formal or informal letter writing scenario instructing students to draft a letter with correct format and body. [Marks: 5]'
  },
  {
    classLevel: 'Class 9',
    topicName: 'अधूरी कहानी पूर्ति एवं शीर्षक',
    questionType: 'LA',
    description: 'अधूरी कहानी तीस-चालिस शब्दों में पूरी करके उचित शीर्षक तथा सीख लिखना (5 अंक)',
    chunkInstruction: 'STRICT FORMAT: Long Answer (LA / Story Completion). Provide an incomplete story starter outline (30-40 words) and instruct students to complete the story, provide a title (शीर्षक), and moral (सीख). [Marks: 5]'
  },
  {
    classLevel: 'Class 9',
    topicName: 'अपठित गद्य-खंड प्रश्नोत्तर',
    questionType: 'VSA',
    description: 'अपठित गद्य-खंड को पढ़कर उसके नीचे दिए गए प्रश्नों के उत्तर लिखिए (8 अंक)',
    chunkInstruction: 'STRICT FORMAT: Reading Comprehension with Short Answers (VSA). Provide an unseen prose passage (अपठित गद्यांश) followed by 8 short-answer comprehension questions. [Marks: 8]'
  },
  {
    classLevel: 'Class 9',
    topicName: 'अपठित गद्य-खंड बहुविकल्पीय प्रश्न',
    questionType: 'MCQ',
    description: 'अपठित गद्य-खंड आधारित बहुविकल्पीय प्रश्न (विकल्प चुनकर उत्तर) (6 अंक)',
    chunkInstruction: 'STRICT FORMAT: Reading Comprehension with MCQs. Provide an unseen prose passage (अपठित गद्यांश) followed by 6 Multiple Choice Questions with 4 options (A, B, C, D). [Marks: 6]'
  }
];

async function seed() {
  console.log('Seeding Goa Board Std 10 & Std 9 Hindi Grammar blueprints into Supabase...');

  // Delete existing Hindi Grammar chapters to ensure clean list
  await supabase.from('chapters').delete().eq('subject', 'Hindi Grammar');

  for (const item of hindiGrammarTopics) {
    const { data: newChapter, error: chapErr } = await supabase
      .from('chapters')
      .insert({
        subject: 'Hindi Grammar',
        class: item.classLevel,
        board: 'Goa Board',
        chapter_name: item.topicName,
        summary: {
          topics: [item.topicName],
          important_terms: ['व्याकरण नियम', 'उदाहरण', 'अभ्यास'],
          question_patterns: [`Expected Style: ${item.questionType}`],
          key_points: [item.description, item.chunkInstruction]
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
      chunk_content: `Topic: ${item.topicName}\nBoard: Goa Board (${item.classLevel})\nDescription: ${item.description}\nInstructions for Question Generation:\n${item.chunkInstruction}`,
      chunk_order: 1,
      chunk_type: 'theory'
    });

    if (chunkErr) {
      console.error(`Failed to insert chunk for ${item.topicName}:`, chunkErr.message);
    } else {
      console.log(`Inserted Goa Board topic for ${item.classLevel}: ${item.topicName} [${item.questionType}]`);
    }
  }

  console.log('Finished seeding all Goa Board Hindi Grammar blueprints for Std 9 & Std 10!');
}

seed().catch((err) => {
  console.error('Error during seeding:', err);
  process.exit(1);
});
