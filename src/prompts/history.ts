import { HistorySummary, Chunk } from '../types';

export const HISTORY_SUMMARIZE_PROMPT = `
You are an expert History and Social Sciences educator. Your task is to analyze the provided history/geography textbook text and extract a structured JSON summary.
Do not include markdown code fences (\`\`\`json). Just return raw JSON matching this schema:
{
  "topics": ["list of major topics covered in this text"],
  "important_terms": ["key terms or concepts, e.g., 'Industrialization', 'Tributary'"],
  "dates": ["important chronological dates and years mentioned in the text"],
  "events": ["key historical events or geographical phenomena mentioned"],
  "people": ["important historical figures, leaders, or authors mentioned in the text"],
  "question_patterns": ["common types of questions asked, e.g., 'Explain the causes of the French Revolution'"]
}
`;

export function compileHistoryGeneratePrompt(
  classLevel: string,
  board: string,
  chapterNames: string[],
  summaries: HistorySummary[],
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
    const datesList = (sum.dates || []).map((d) => `- ${d}`).join('\n');
    const eventsList = (sum.events || []).map((e) => `- ${e}`).join('\n');
    const peopleList = (sum.people || []).map((p) => `- ${p}`).join('\n');
    const termsList = (sum.important_terms || []).map((p) => `- ${p}`).join('\n');
    return `
### Chapter ${idx + 1}: ${name}
- Topics covered:
${topicsList}

- Important Terms:
${termsList}

- Dates:
${datesList}

- Key Events:
${eventsList}

- Historical Figures / Key People:
${peopleList}
`;
  }).join('\n\n');

  const balanceInstructions = `
### IMPORTANT BALANCING & WEIGHTING INSTRUCTIONS:
1. **No Chapter Bias**: You are generating a worksheet across ${chapterNames.length} distinct chapters. You MUST distribute the ${count} total questions fairly and proportionally across all these chapters.
2. **No Chunk Bias**: Within each chapter, consider all textbook content chunks equally. Do not bias towards only the first section or only the exercises at the end.
3. **Importance-Based Weighting**: Distribute questions across chunks based on the importance of each section's concepts. Give higher frequency/weight to chunks introducing major historical shifts, dates, and figures, but still cover the other chunks (like theory and facts) to test the overall concepts.
`;

  return `
You are a History and Social Sciences examiner. Generate a customized combined worksheet based on the following chapter data.

### CRITICAL INSTRUCTION (STRICT GROUNDED GENERATION):
All questions and answers MUST be derived ONLY and DIRECTLY from the textbook text provided below. 
Do NOT introduce external historical facts, dates, figures, or assumptions not explicit in the provided chunks. If something is not mentioned in the source chunks, do not ask a question about it. 

### Worksheet Info:
- Subject: History/Geography
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
- Target Difficulty: ${difficulty} (Easy = direct retrieval of facts; Medium = explanation of causes/effects from text; Hard = analytical/comparative questions using multiple sections of the text)
- Pedagogical Mode: ${mode} (Note: regardless of mode, questions must remain 100% grounded in the source text)
- **No Marks in Text**: Do NOT include any marks values (e.g., "(5 Marks)" or "[5m]") inside the "question_text" string. The layout engine will automatically display and format the marks at the end of the question row.

### Output Format Requirement:
Generate the questions and answers. Return only a raw JSON array of question objects (NO markdown blocks, NO \`\`\`json backticks). The JSON schema must be:
[
  {
    "question_number": 1,
    "question_text": "Detailed question text based strictly on facts present in the text. Do NOT include marks details in this string.",
    "marks": 5,
    "solution": "Detailed model answer containing specific facts, names, and dates found in the text."
  }
]
`;
}
