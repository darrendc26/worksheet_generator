import { ITSummary, Chunk } from '../types';

export const IT_SUMMARIZE_PROMPT = `
You are an expert Information Technology (IT) and Computer Science educator. Your task is to analyze the provided textbook text (Programming, Databases, Web Development, Networking, or Cybersecurity) and extract a structured JSON summary.
Do not include markdown code fences (\`\`\`json). Just return raw JSON matching this schema:
{
  "topics": ["list of major topics covered in this text"],
  "important_terms": ["technical terms, acronyms, or protocol names, e.g., 'IP Address', 'Polymorphism', 'Normalization'"],
  "key_concepts": ["important computer science theories, system architectures, or algorithm logic described"],
  "code_or_commands": ["programming syntax, code snippets, database queries, terminal commands, or HTML/CSS tags introduced"],
  "question_patterns": ["common types of questions asked, e.g., 'Write a Python program to...', 'Explain the OSI model layers'"]
}
`;

export function compileITGeneratePrompt(
  classLevel: string,
  board: string,
  chapterNames: string[],
  summaries: ITSummary[],
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
    const codeList = (sum.code_or_commands || []).map((c) => `- \`${c}\``).join('\n');
    const patternsList = (sum.question_patterns || []).map((p) => `- ${p}`).join('\n');
    return `
### Chapter ${idx + 1}: ${name}
- Topics covered:
${topicsList}

- Important Terms:
${termsList}

- Key Concepts:
${conceptsList}

- Code / Commands / Syntax:
${codeList}

- Typical question patterns:
${patternsList}
`;
  }).join('\n\n');

  let modeInstruction = '';
  switch (mode) {
    case 'similarity':
      modeInstruction = `Focus on generating coding exercises, terminal command usage, syntax correction, or SQL queries modeled on the examples in the textbook text. Preserve the technical skills required, but modify the exact parameters, data structures, or variables.`;
      break;
    case 'challenge':
      modeInstruction = `Focus on advanced technical challenges: database schema design, troubleshooting buggy scripts, script efficiency/optimization, or planning a network system architecture. Encourage students to write optimized and well-commented code.`;
      break;
    case 'weak_foundation':
      modeInstruction = `Focus on direct conceptual recall, simple hardware/software terminology definitions, identifying errors in short code lines, and straightforward command options.`;
      break;
    case 'revision':
    default:
      modeInstruction = `Provide a comprehensive revision mix of conceptual definitions, tracing code outputs, filling in missing syntax, and simple script writing.`;
      break;
  }

  const balanceInstructions = `
### IMPORTANT BALANCING & WEIGHTING INSTRUCTIONS:
1. **No Chapter Bias**: You are generating a worksheet across ${chapterNames.length} distinct chapters. You MUST distribute the ${count} total questions fairly and proportionally across all these chapters.
2. **No Chunk Bias**: Within each chapter, consider all textbook content chunks equally. Do not bias towards only the first section or only the exercises at the end.
3. **Importance-Based Weighting**: Distribute questions across chunks based on the importance of each section's concepts. Give higher frequency/weight to chunks introducing programming logic, syntax, network models, and databases, but still cover the general theory.
`;

  return `
You are an IT and Computer Science examiner. Generate a customized combined worksheet based on the following chapter data.

### Worksheet Info:
- Subject: Information Technology
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
- Target Difficulty: ${difficulty} (Adjust coding complexity and logical depth accordingly)
- Pedagogical Mode: ${mode}
  Instruction for Mode: ${modeInstruction}
- **Syntax Styling**: Use markdown formatting (\`\`\`python, \`\`\`sql, \`\`\`javascript, etc.) for code blocks inside the "question_text" and "solution" fields to keep code readable.
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
    "marks": 4,
    "solution": "Step-by-step model answer, showing code blocks, command syntaxes, or detailed conceptual explanations where appropriate."
  }
]
`;
}
