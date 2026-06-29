import { GeneralSummary, Chunk } from '../types';

export const SCIENCE_SUMMARIZE_PROMPT = `
You are an expert Science educator. Your task is to analyze the provided science textbook text (Physics, Chemistry, or Biology) and extract a structured JSON summary.
Do not include markdown code fences (\`\`\`json). Just return raw JSON matching this schema:
{
  "topics": ["list of major topics covered in this text"],
  "important_terms": ["scientific terms, symbols, or definitions, e.g., 'Molarity', 'Mitochondria'"],
  "key_points": ["important theories, laws, observations, or experimental procedures described"],
  "question_patterns": ["common types of questions asked, e.g., 'Describe the process of photosynthesis'"]
}
`;

export function compileScienceGeneratePrompt(
  classLevel: string,
  board: string,
  chapterNames: string[],
  summaries: GeneralSummary[],
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
    const pointsList = (sum.key_points || []).map((p) => `- ${p}`).join('\n');
    const termsList = (sum.important_terms || []).map((t) => `- ${t}`).join('\n');
    const patternsList = (sum.question_patterns || []).map((p) => `- ${p}`).join('\n');
    return `
### Chapter ${idx + 1}: ${name}
- Topics covered:
${topicsList}

- Key Points & Laws:
${pointsList}

- Important Terms:
${termsList}

- Typical question patterns:
${patternsList}
`;
  }).join('\n\n');

  let modeInstruction = '';
  switch (mode) {
    case 'similarity':
      modeInstruction = `Focus on generating questions similar to the exercises or numerical problems presented in the textbook. For Physics or Chemistry, you may create new numeric problems based on the formulas in the text.`;
      break;
    case 'challenge':
      modeInstruction = `Focus on application-based, analytical, and conceptual questions. Students should explain 'why' and 'how' phenomena occur, or solve complex numeric problems that require multiple logical steps.`;
      break;
    case 'weak_foundation':
      modeInstruction = `Focus on definition, recall, direct formula application, and identification questions. Keep explanations straightforward and numeric calculations direct.`;
      break;
    case 'revision':
    default:
      modeInstruction = `Provide a standard balanced set of questions including definitions, short answer conceptual explanations, and calculation problems.`;
      break;
  }

  const balanceInstructions = `
### IMPORTANT BALANCING & WEIGHTING INSTRUCTIONS:
1. **No Chapter Bias**: You are generating a worksheet across ${chapterNames.length} distinct chapters. You MUST distribute the ${count} total questions fairly and proportionally across all these chapters.
2. **No Chunk Bias**: Within each chapter, consider all textbook content chunks equally. Do not bias towards only the first section or only the exercises at the end.
3. **Importance-Based Weighting**: Distribute questions across chunks based on the importance of each section's concepts. Give higher frequency/weight to chunks introducing core laws, chemical equations, diagrams, and experimental methods, but still cover the other chunks (like theory and facts) to test the overall concepts.
`;

  return `
You are a Science examiner for a tuition centre. Generate a customized combined worksheet based on the following chapter data.

### Worksheet Info:
- Subject: Science
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
- Target Difficulty: ${difficulty} (Adjust conceptual complexity accordingly)
- Pedagogical Mode: ${mode}
  Instruction for Mode: ${modeInstruction}
- **Diagram Instruction**: Do NOT embed any SVG diagrams in the "question_text" field. Instead, generate questions that ask the student to draw, label, or complete diagrams themselves (e.g., "Draw a schematic diagram of a circuit...", "Draw and label a ray diagram showing...").
- **Formal Question Styling**: Write direct, formal, exam-style questions. Do NOT start questions with hypothetical/imaginative phrasing like "Imagine a...", "Consider a...", "Suppose...", or "Assume there is a...". State the parameters and requirements directly.
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
    "question_text": "Detailed question text. Do NOT include any marks details or SVG drawings in this string.",
    "marks": 4,
    "solution": "Step-by-step model answer, explaining the underlying scientific concepts, chemical equations, or numerical formulas. You can include helper SVG diagrams here if relevant."
  }
]
`;
}
