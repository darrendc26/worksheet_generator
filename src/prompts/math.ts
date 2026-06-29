import { MathSummary, Chunk } from '../types';

export const MATH_SUMMARIZE_PROMPT = `
You are an expert Mathematics educator. Your task is to analyze the provided math textbook chapter text and extract a structured JSON summary.
Do not include markdown code fences (\`\`\`json). Just return raw JSON matching this schema:
{
  "topics": ["list of major topics covered in this text"],
  "important_terms": ["key terms like 'Hypotenuse', 'Coefficient', etc."],
  "formulas": ["mathematical equations or formulas introduced in LaTeX or clean text format"],
  "examples": ["brief descriptions of example problems solved in the text"],
  "question_patterns": ["common types of questions asked, e.g., 'Solve for x in quadratic equation'"]
}
`;

export function compileMathGeneratePrompt(
  classLevel: string,
  board: string,
  chapterNames: string[],
  summaries: MathSummary[],
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
    const formulasList = (sum.formulas || []).map((f) => `- ${f}`).join('\n');
    const examplesList = (sum.examples || []).map((e) => `- ${e}`).join('\n');
    const patternsList = (sum.question_patterns || []).map((p) => `- ${p}`).join('\n');
    return `
### Chapter ${idx + 1}: ${name}
- Topics covered:
${topicsList}

- Formulas:
${formulasList}

- Examples found in text:
${examplesList}

- Typical question patterns:
${patternsList}
`;
  }).join('\n\n');

  let modeInstruction = '';
  switch (mode) {
    case 'similarity':
      modeInstruction = `Create new math questions that are modeled on the example problems and exercises found in the textbook text. Do NOT copy the questions word-for-word or use the exact same numbers. Modify the numeric coefficients, the variables, or the scenario, but preserve the core solving technique.`;
      break;
    case 'challenge':
      modeInstruction = `Generate high-order thinking skills (HOTS) questions. These should be multi-step math problems that combine multiple formulas from the chapter. They should test deep conceptual understanding.`;
      break;
    case 'weak_foundation':
      modeInstruction = `Focus on basic conceptual questions. Break down problems into smaller parts and keep the calculations simple. Use simple numbers to help students build confidence in the fundamental methods.`;
      break;
    case 'revision':
    default:
      modeInstruction = `Provide a comprehensive revision mix of questions spanning all topics in the chapter, ranging from simple direct application of formulas to standard word problems.`;
      break;
  }

  const balanceInstructions = `
### IMPORTANT BALANCING & WEIGHTING INSTRUCTIONS:
1. **No Chapter Bias**: You are generating a worksheet across ${chapterNames.length} distinct chapters. You MUST distribute the ${count} total questions fairly and proportionally across all these chapters. No chapter should be ignored or biased.
2. **No Chunk Bias**: Within each chapter, consider all textbook content chunks equally. Do not bias towards only the first section or only the exercises at the end.
3. **Importance-Based Weighting**: Distribute questions across chunks based on the importance of each section's concepts. Give higher frequency/weight to chunks introducing core formulas, definitions, and solved examples, but still cover the other chunks (like theory and facts) to test the overall concepts.
`;

  return `
You are a Mathematics examiner for a tuition centre. Generate a customized combined worksheet based on the following chapter data.

### Worksheet Info:
- Subject: Mathematics
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
- Target Difficulty: ${difficulty} (Adjust equation complexity and mathematical steps accordingly)
- Pedagogical Mode: ${mode}
  Instruction for Mode: ${modeInstruction}
- **Decimal Repeating/Bar Notation**: When generating questions containing repeating decimals, do NOT use combining macrons, overlines, or the word "bar" (e.g. do not write "0.6\u0304", "0.6bar", or "0.6̄"). You MUST represent repeating decimals by writing the repeating digits multiple times followed by an ellipsis (e.g. write "0.666...", write "0.4777...", and write "0.001001...").
- **No Marks in Text**: Do NOT include any marks values (e.g., "(5 Marks)" or "[5m]") inside the "question_text" string. The layout engine will automatically display and format the marks at the end of the question row.

### Output Format Requirement:
Generate the questions and answers. Return only a raw JSON array of question objects (NO markdown blocks, NO \`\`\`json backticks). The JSON schema must be:
[
  {
    "question_number": 1,
    "question_text": "Detailed question text. Use plain text or standard clean symbols for equations (e.g., standard variables x, y, and super/subscripts like x^2). Do NOT include marks details in this string.",
    "marks": 3,
    "solution": "Step-by-step detailed solution and final answer for the teacher."
  }
]
`;
}
