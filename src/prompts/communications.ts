import { CommunicationsSummary, Chunk } from '../types';

export const COMMUNICATIONS_SUMMARIZE_PROMPT = `
You are an expert Communications and English language educator. Your task is to analyze the provided textbook text (covering Grammar, Writing Skills, Presentation Skills, Interpersonal Communication, or Business Correspondence) and extract a structured JSON summary.
Do not include markdown code fences (\`\`\`json). Just return raw JSON matching this schema:
{
  "topics": ["list of major topics covered in this text"],
  "important_terms": ["communication jargon, grammatical terms, or styling terms, e.g., 'Active Voice', 'Non-verbal Cues', 'Email Etiquette'"],
  "key_concepts": ["important communication models, theories, barriers, or grammatical rules described in the text"],
  "writing_formats_or_examples": ["structural templates, letter outlines, sample dialogues, idioms, or writing formats introduced in the text"],
  "question_patterns": ["common types of questions asked, e.g., 'Convert the sentence to passive voice', 'Draft a complaint letter about...'"]
}
`;

export function compileCommunicationsGeneratePrompt(
  classLevel: string,
  board: string,
  chapterNames: string[],
  summaries: CommunicationsSummary[],
  chunks: Chunk[],
  difficulty: string,
  count: number,
  mode: string
): string {
  const includeContent = (mode === 'strict_grounded');
  const chunksText = chunks
    .map((c) => {
      const header = `[Chunk ${c.chunk_order} - Chapter: ${c.chapter_id} - Type: ${c.chunk_type}]\nTitle: ${c.chunk_title || 'N/A'}`;
      return includeContent ? `${header}\nContent:\n${c.chunk_content}` : header;
    })
    .join('\n\n');

  const summariesText = chapterNames.map((name, idx) => {
    const sum = summaries[idx];
    const topicsList = (sum.topics || []).map((t) => `- ${t}`).join('\n');
    const termsList = (sum.important_terms || []).map((t) => `- ${t}`).join('\n');
    const conceptsList = (sum.key_concepts || []).map((c) => `- ${c}`).join('\n');
    const formatsList = (sum.writing_formats_or_examples || []).map((f) => `- ${f}`).join('\n');
    const patternsList = (sum.question_patterns || []).map((p) => `- ${p}`).join('\n');
    return `
### Chapter ${idx + 1}: ${name}
- Topics covered:
${topicsList}

- Important Terms:
${termsList}

- Key Concepts & Rules:
${conceptsList}

- Writing Formats & Sample Templates:
${formatsList}

- Typical question patterns:
${patternsList}
`;
  }).join('\n\n');

  let modeInstruction = '';
  switch (mode) {
    case 'similarity':
      modeInstruction = `Focus on grammar conversions (e.g. passive to active voice), rewriting dialogue scenarios, format adjustments, or completing vocabulary exercises modeled on the textbook examples. Modify details but retain the core linguistic or style rules.`;
      break;
    case 'challenge':
      modeInstruction = `Focus on case studies analyzing communication breakdowns, drafting persuasive essays/emails/letters for complex professional scenarios, or analyzing and altering paragraph tone (e.g., informal to formal, passive to active).`;
      break;
    case 'weak_foundation':
      modeInstruction = `Focus on simple grammatical checks (spelling, matching words, identifying parts of speech), basic definition recall of communication channels, and completing simple fill-in-the-blanks.`;
      break;
    case 'revision':
    default:
      modeInstruction = `Provide a standard balanced mix of grammar/syntax exercises, theoretical definitions of communication components, dialogue editing, and short drafting (such as writing a message or postcard).`;
      break;
  }

  const balanceInstructions = `
### IMPORTANT BALANCING & WEIGHTING INSTRUCTIONS:
1. **No Chapter Bias**: You are generating a worksheet across ${chapterNames.length} distinct chapters. You MUST distribute the ${count} total questions fairly and proportionally across all these chapters.
2. **No Chunk Bias**: Within each chapter, consider all textbook content chunks equally. Do not bias towards only the first section or only the exercises at the end.
3. **Importance-Based Weighting**: Distribute questions across chunks based on the importance of each section's concepts. Give higher frequency/weight to chunks introducing primary formats (emails, reports, letters) and central communication concepts, but still cover the other chunks (like theory and facts) to test the overall concepts.
`;

  return `
You are an English and Communications examiner. Generate a customized combined worksheet based on the following chapter data.

### Worksheet Info:
- Subject: Communications
- Class: ${classLevel}
- Board: ${board}
- Target Chapters Count: ${chapterNames.length}
- Chapter Names: ${chapterNames.join(', ')}

${balanceInstructions}

### Chapter Summaries:
${summariesText}

### Textbook Source Chunks:
${chunksText}

### Worksheet Parameters:
- Total Questions requested: ${count}
- Target Difficulty: ${difficulty} (Adjust vocabulary, reading level, and composition depth accordingly)
- Pedagogical Mode: ${mode}
  Instruction for Mode: ${modeInstruction}
- **Strict Marking Scheme Guide**: You MUST assign the "marks" field to each question strictly based on the complexity and size of the answer required:
  * **1 Mark**: Multiple Choice Questions (MCQ) or Very Short Answer (VSA) questions requiring only a single word, final numeric value, or basic direct recall.
  * **2 Marks**: Short Answer (SA) questions requiring a brief explanation of two key points, or a simple 1-2 step calculation/equation solving.
  * **4 Marks**: Long Answer (LA) questions requiring analytical thinking, detailed multi-step mathematical proofs/derivations, complex numerical calculations, or multi-part questions (e.g. sub-questions (a), (b), etc.).
- **No Marks in Text**: Do NOT include any marks values (e.g., "(5 Marks)" or "[5m]") inside the "question_text" string. The layout engine will automatically display and format the marks at the end of the question row.

### Output Format Requirement:
Generate the questions and answers. Return only a raw JSON array of question objects (NO markdown blocks, NO \`\`\`json backticks). The JSON schema must be:
[
  {
    "question_number": 1,
    "question_text": "Detailed question text. Do NOT include any marks details inside this string.",
    "marks": 2,
    "solution": "Linguistic correction, draft template, dialogue completing, or detailed model answer matching the expected marking points."
  }
]
`;
}
