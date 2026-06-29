/// <reference path="../types/declarations.d.ts" />
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import dotenv from 'dotenv';
import { Chunk } from '../types';
import { MATH_SUMMARIZE_PROMPT, compileMathGeneratePrompt } from '../prompts/math';
import { HISTORY_SUMMARIZE_PROMPT, compileHistoryGeneratePrompt } from '../prompts/history';
import { SCIENCE_SUMMARIZE_PROMPT, compileScienceGeneratePrompt } from '../prompts/science';

function getGeminiClient() {
  dotenv.config({ override: true });
  const apiKey = process.env.GEMINI_API_KEY || 'placeholder-api-key';
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const genAI = new GoogleGenerativeAI(apiKey);
  return { genAI, modelName };
}export interface GeneratedQuestionResponse {
  question_number: number;
  question_text: string;
  marks: number;
  solution: string;
  sectionName?: string;
}



export interface ChunkAndSummaryResult {
  summary: any;
  chunks: Array<{
    chunk_title: string;
    chunk_content: string;
    chunk_type: string;
  }>;
}

function cleanJsonText(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  return cleaned.trim();
}

/**
 * Analyzes textbook content and splits it into semantic chunks and structured summaries
 * in a single, token-efficient Gemini API call.
 */
export async function analyzeAndChunkChapter(
  chapterText: string,
  subject: string
): Promise<ChunkAndSummaryResult> {
  const isMath = subject.toLowerCase().includes('math') || subject.toLowerCase().includes('algebra') || subject.toLowerCase().includes('geometry');
  const isHistory = subject.toLowerCase().includes('history') || subject.toLowerCase().includes('geography') || subject.toLowerCase().includes('civics') || subject.toLowerCase().includes('social');
  
  let summarizePrompt = SCIENCE_SUMMARIZE_PROMPT;
  let summaryStructure = `
  {
    "topics": ["string"],
    "important_terms": ["string"],
    "key_points": ["string"],
    "question_patterns": ["string"]
  }`;

  if (isMath) {
    summarizePrompt = MATH_SUMMARIZE_PROMPT;
    summaryStructure = `
    {
      "topics": ["string"],
      "important_terms": ["string"],
      "formulas": ["string"],
      "examples": ["string"],
      "question_patterns": ["string"]
    }`;
  } else if (isHistory) {
    summarizePrompt = HISTORY_SUMMARIZE_PROMPT;
    summaryStructure = `
    {
      "topics": ["string"],
      "important_terms": ["string"],
      "dates": ["string"],
      "events": ["string"],
      "people": ["string"],
      "question_patterns": ["string"]
    }`;
  }

  const systemInstruction = `
You are an expert curriculum architect. Your task is to analyze textbook content, extract a detailed structured summary, and segment the text into logical semantic chunks (sections of ~400-800 words each).
Ensure that the entire provided text is covered in the chunks, without dropping any paragraphs or exercises.

You must return a raw JSON object with NO markdown formatting, matching this schema:
{
  "summary": ${summaryStructure},
  "chunks": [
    {
      "chunk_title": "Descriptive title for this section",
      "chunk_content": "The actual exact text representing this section from the source text",
      "chunk_type": "theory" | "example" | "exercise" | "facts"
    }
  ]
}
`;

  const { genAI, modelName } = getGeminiClient();
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          summary: {
            type: SchemaType.OBJECT,
            properties: {
              topics: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
              important_terms: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
              formulas: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
              examples: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
              dates: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
              events: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
              people: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
              key_points: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
              question_patterns: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } }
            }
          },
          chunks: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                chunk_title: { type: SchemaType.STRING },
                chunk_content: { type: SchemaType.STRING },
                chunk_type: { type: SchemaType.STRING }
              },
              required: ["chunk_title", "chunk_content", "chunk_type"]
            }
          }
        },
        required: ["summary", "chunks"]
      }
    },
  });

  const response = await model.generateContent([
    systemInstruction,
    `Subject: ${subject}\n\nChapter Content to analyze:\n${chapterText}`
  ]);

  const jsonText = response.response.text();
  try {
    const cleanedText = cleanJsonText(jsonText);
    return JSON.parse(cleanedText) as ChunkAndSummaryResult;
  } catch (err) {
    console.error('Failed to parse Gemini chapter analysis response:', jsonText);
    throw new Error('Gemini response was not valid JSON.');
  }
}

/**
 * Generates custom worksheet questions and answers based on subject, summaries, content chunks,
 * difficulty, total count, and pedagogical mode. Supports multiple chapters.
 */
export async function generateQuestions(
  subject: string,
  classLevel: string,
  board: string,
  chapterNames: string[],
  summaries: any[],
  chunks: Chunk[],
  difficulty: string,
  count: number,
  mode: string,
  additionalNotes?: string,
  includeDiagrams: boolean = true
): Promise<GeneratedQuestionResponse[]> {
  const isMath = subject.toLowerCase().includes('math') || subject.toLowerCase().includes('algebra') || subject.toLowerCase().includes('geometry');
  const isHistory = subject.toLowerCase().includes('history') || subject.toLowerCase().includes('geography') || subject.toLowerCase().includes('civics') || subject.toLowerCase().includes('social');

  let prompt = '';
  if (isMath) {
    prompt = compileMathGeneratePrompt(classLevel, board, chapterNames, summaries, chunks, difficulty, count, mode);
  } else if (isHistory) {
    prompt = compileHistoryGeneratePrompt(classLevel, board, chapterNames, summaries, chunks, difficulty, count, mode);
  } else {
    prompt = compileScienceGeneratePrompt(classLevel, board, chapterNames, summaries, chunks, difficulty, count, mode);
  }

  const isScience = !isMath && !isHistory;

  if (!isScience && includeDiagrams) {
    // Append generic SVG diagram instructions for Mathematics & History
    prompt += `
\n
### IMPORTANT DIAGRAM & VISUAL AID INSTRUCTION:
If a question requires any visual aid (such as coordinate planes, functions/equation graphs, geometric triangles, circles with sectors/arcs, intersecting lines, angles, linear pairs, ancient scripts like Mayan script numbers, cuneiform, ciphers, or ancient Chinese Rod counting numbers), you MUST generate a standard, clean, raw SVG string representing the diagram and embed it directly in the middle or end of the "question_text" string.
- Keep the SVG minimalist, lightweight, and modern.
- Scale: The SVG must use a width and height of 100 to 180 (specify width="120" and height="120" attributes on the <svg> root).
- Supported elements: <rect>, <circle>, <ellipse>, <line>, <polygon>, <path>, and <text> (with text content like "<text x=\\"10\\" y=\\"20\\" font-size=\\"8\\">A</text>").
- Style coordinates from top-left (0,0). Use stroke="#334155" (or hex colors) and stroke-width="1.2". Fill elements with color hex codes or "none".
- Do not use external fonts or CSS. Keep it in simple inline attributes.
- **Strict Geometric Topology & Naming Alignment**: The labels and lines drawn MUST correspond mathematically and logically. If a proof mentions points A, B, C, D, P, the labels in the diagram must be placed next to their respective geometric intersections/vertices.

- **Standard Geometric Coordinates Templates (USE EXACTLY FOR QUALITY AND ACCURACY)**:
  1. **Triangles sharing the same base on the SAME side (e.g. ABC and DBC on base BC, vertices A and D on same side, AD extended to meet BC at P)**:
     * Base BC: <line x1=\\"20\\" y1=\\"100\\" x2=\\"100\\" y2=\\"100\\" stroke=\\"#334155\\" stroke-width=\\"1.2\\"/>
     * Outer peak A: (60,20). Left side AB: <line x1=\\"60\\" y1=\\"20\\" x2=\\"20\\" y2=\\"100\\" stroke=\\"#334155\\" stroke-width=\\"1.2\\"/>, Right side AC: <line x1=\\"60\\" y1=\\"20\\" x2=\\"100\\" y2=\\"100\\" stroke=\\"#334155\\" stroke-width=\\"1.2\\"/>
     * Inner peak D (must be on the SAME side as A, between A and the base): (60,60). Side DB: <line x1=\\"60\\" y1=\\"60\\" x2=\\"20\\" y2=\\"100\\" stroke=\\"#334155\\" stroke-width=\\"1.2\\"/>, Side DC: <line x1=\\"60\\" y1=\\"60\\" x2=\\"100\\" y2=\\"100\\" stroke=\\"#334155\\" stroke-width=\\"1.2\\"/>
     * Extended line segment AP meeting BC at P: <line x1=\\"60\\" y1=\\"20\\" x2=\\"60\\" y2=\\"100\\" stroke=\\"#334155\\" stroke-width=\\"1.2\\" stroke-dasharray=\\"2,2\\"/>
     * Point P on BC: (60,100).
     * Labels:
       A: <text x=\\"57\\" y=\\"15\\" font-size=\\"8\\">A</text>
       B: <text x=\\"12\\" y=\\"105\\" font-size=\\"8\\">B</text>
       C: <text x=\\"103\\" y=\\"105\\" font-size=\\"8\\">C</text>
       D: <text x=\\"64\\" y=\\"58\\" font-size=\\"8\\">D</text>
       P: <text x=\\"63\\" y=\\"112\\" font-size=\\"8\\">P</text>
  2. **Triangles sharing the same base on OPPOSITE sides (e.g. ABC and DBC on base BC, vertices A and D on opposite sides, AD intersects BC at P)**:
     * Base BC: <line x1=\\"20\\" y1=\\"60\\" x2=\\"100\\" y2=\\"60\\" stroke=\\"#334155\\" stroke-width=\\"1.2\\"/>
     * Upper peak A: (60,20). Side AB: <line x1=\\"60\\" y1=\\"20\\" x2=\\"20\\" y2=\\"60\\" stroke=\\"#334155\\" stroke-width=\\"1.2\\"/>, Side AC: <line x1=\\"60\\" y1=\\"20\\" x2=\\"100\\" y2=\\"60\\" stroke=\\"#334155\\" stroke-width=\\"1.2\\"/>
     * Lower peak D: (60,100). Side DB: <line x1=\\"60\\" y1=\\"100\\" x2=\\"20\\" y2=\\"60\\" stroke=\\"#334155\\" stroke-width=\\"1.2\\"/>, Side DC: <line x1=\\"60\\" y1=\\"100\\" x2=\\"100\\" y2=\\"60\\" stroke=\\"#334155\\" stroke-width=\\"1.2\\"/>
     * Intersecting line AD: <line x1=\\"60\\" y1=\\"20\\" x2=\\"60\\" y2=\\"100\\" stroke=\\"#334155\\" stroke-width=\\"1.2\\" stroke-dasharray=\\"2,2\\"/>
     * Point P on BC: (60,60).
     * Labels:
       A: <text x=\\"57\\" y=\\"15\\" font-size=\\"8\\">A</text>
       B: <text x=\\"12\\" y=\\"62\\" font-size=\\"8\\">B</text>
       C: <text x=\\"103\\" y=\\"62\\" font-size=\\"8\\">C</text>
       D: <text x=\\"57\\" y=\\"112\\" font-size=\\"8\\">D</text>
       P: <text x=\\"63\\" y=\\"68\\" font-size=\\"8\\">P</text>
  3. **Bowtie / Vertical Angle Triangles (e.g. AOB and COD sharing vertex O, congruence/similarity)**:
     * Vertices: A(20,25), B(20,95), O(60,60), C(100,25), D(100,95).
     * Straight lines AD and BC intersecting at O:
       AD: <line x1=\\"20\\" y1=\\"25\\" x2=\\"100\\" y2=\\"95\\" stroke=\\"#334155\\" stroke-width=\\"1.2\\"/>
       BC: <line x1=\\"20\\" y1=\\"95\\" x2=\\"100\\" y2=\\"25\\" stroke=\\"#334155\\" stroke-width=\\"1.2\\"/>
     * Left side AB: <line x1=\\"20\\" y1=\\"25\\" x2=\\"20\\" y2=\\"95\\" stroke=\\"#334155\\" stroke-width=\\"1.2\\"/>
     * Right side CD: <line x1=\\"100\\" y1=\\"25\\" x2=\\"100\\" y2=\\"95\\" stroke=\\"#334155\\" stroke-width=\\"1.2\\"/>
     * Labels:
       A: <text x=\\"12\\" y=\\"23\\" font-size=\\"8\\">A</text>
       B: <text x=\\"12\\" y=\\"98\\" font-size=\\"8\\">B</text>
       O: <text x=\\"57\\" y=\\"53\\" font-size=\\"8\\">O</text>
       C: <text x=\\"103\\" y=\\"23\\" font-size=\\"8\\">C</text>
       D: <text x=\\"103\\" y=\\"98\\" font-size=\\"8\\">D</text>
  4. **Parallel lines cut by a transversal**:
     * Parallel Line 1 (top): <line x1=\\"10\\" y1=\\"30\\" x2=\\"110\\" y2=\\"30\\" stroke=\\"#334155\\" stroke-width=\\"1.2\\"/>
     * Parallel Line 2 (bottom): <line x1=\\"10\\" y1=\\"90\\" x2=\\"110\\" y2=\\"90\\" stroke=\\"#334155\\" stroke-width=\\"1.2\\"/>
     * Transversal line: <line x1=\\"30\\" y1=\\"10\\" x2=\\"90\\" y2=\\"110\\" stroke=\\"#334155\\" stroke-width=\\"1.2\\"/>
     * Intersections: P(42,30) and Q(78,90).
     * Labels:
       P: <text x=\\"34\\" y=\\"25\\" font-size=\\"8\\">P</text>
       Q: <text x=\\"83\\" y=\\"95\\" font-size=\\"8\\">Q</text>
  5. **Angles/Linear Pairs**:
     * Horizontal line AB: <line x1=\\"10\\" y1=\\"80\\" x2=\\"110\\" y2=\\"80\\" stroke=\\"#334155\\" stroke-width=\\"1.2\\"/>
     * Origin point O: (60,80).
     * Ray OC tilted (e.g., at 130°/50°): <line x1=\\"60\\" y1=\\"80\\" x2=\\"35\\" y2=\\"37\\" stroke=\\"#334155\\" stroke-width=\\"1.2\\"/>
     * Labels:
       A: <text x=\\"7\\" y=\\"88\\" font-size=\\"8\\">A</text>
       B: <text x=\\"110\\" y=\\"88\\" font-size=\\"8\\">B</text>
       O: <text x=\\"57\\" y=\\"90\\" font-size=\\"8\\">O</text>
       C: <text x=\\"32\\" y=\\"32\\" font-size=\\"8\\">C</text>
  6. **Circles with Sectors/Arcs/Chords**:
     * Draw circle: <circle cx=\\"60\\" cy=\\"60\\" r=\\"40\\" fill=\\"none\\" stroke=\\"#334155\\" stroke-width=\\"1.2\\"/>
     * Center O: (60,60). Label O: <text x=\\"56\\" y=\\"56\\" font-size=\\"8\\">O</text>
     * Sector paths must use explicit arc commands or intersecting radii lines.
  7. **Physics Circuit Diagrams (resistors, battery, switches, meters)**:
     * Draw rectangular loop for wire (e.g. from (20,20) to (100,100)):
       <rect x=\\"20\\" y=\\"20\\" width=\\"80\\" height=\\"80\\" fill=\\"none\\" stroke=\\"#334155\\" stroke-width=\\"1.2\\"/>
     * Resistor (represented as a standard clean rectangle on top wire):
       <rect x=\\"45\\" y=\\"15\\" width=\\"30\\" height=\\"10\\" fill=\\"#f8fafc\\" stroke=\\"#334155\\" stroke-width=\\"1.2\\"/>
       (Label above resistor: <text x=\\"55\\" y=\\"11\\" font-size=\\"8\\">R</text>)
     * Battery (placed on bottom wire at y=100, centered around x=60):
       First clear/overwrite bottom wire segment: <line x1=\\"50\\" y1=\\"100\\" x2=\\"70\\" y2=\\"100\\" stroke=\\"#ffffff\\" stroke-width=\\"2.5\\"/> (acts as erase)
       Draw positive plate (longer): <line x1=\\"55\\" y1=\\"90\\" x2=\\"55\\" y2=\\"110\\" stroke=\\"#334155\\" stroke-width=\\"1.2\\"/>
       Draw negative plate (shorter, thicker): <line x1=\\"65\\" y1=\\"95\\" x2=\\"65\\" y2=\\"105\\" stroke=\\"#334155\\" stroke-width=\\"2\\"/>
       Connect wires back: <line x1=\\"50\\" y1=\\"100\\" x2=\\"55\\" y2=\\"100\\" stroke=\\"#334155\\" stroke-width=\\"1.2\\"/> and <line x1=\\"65\\" y1=\\"100\\" x2=\\"70\\" y2=\\"100\\" stroke=\\"#334155\\" stroke-width=\\"1.2\\"/>
     * Voltmeter / Ammeter (placed on left/right vertical wires, or in parallel):
       Circle: <circle cx=\\"100\\" cy=\\"60\\" r=\\"10\\" fill=\\"#ffffff\\" stroke=\\"#334155\\" stroke-width=\\"1.2\\"/>
       Label 'A' or 'V': <text x=\\"97\\" y=\\"63\\" font-size=\\"8\\" font-weight=\\"bold\\">A</text>
     * Light bulb:
       Circle: <circle cx=\\"100\\" cy=\\"60\\" r=\\"10\\" fill=\\"none\\" stroke=\\"#334155\\" stroke-width=\\"1.2\\"/>
       Internal 'X' loop: <line x1=\\"93\\" y1=\\"53\\" x2=\\"107\\" y2=\\"67\\" stroke=\\"#334155\\" stroke-width=\\"1.2\\"/> and <line x1=\\"93\\" y1=\\"67\\" x2=\\"107\\" y2=\\"53\\" stroke=\\"#334155\\" stroke-width=\\"1.2\\"/>
- **Labels & Offsets**: Place text labels (like A, B, C, D, P, Q, R, S, T, O, x, y or angle values) with a slight offset (3-8 pixels) from lines and points so they are clean, readable, and do not overlap.
- Example: "question_text": "Observe the diagram: <svg width=\\"120\\" height=\\"120\\"><rect x=\\"10\\" y=\\"20\\" width=\\"40\\" height=\\"40\\" fill=\\"#e2e8f0\\" stroke=\\"#334155\\" stroke-width=\\"1.2\\"/><circle cx=\\"30\\" cy=\\"40\\" r=\\"10\\" fill=\\"#3b82f6\\"/><text x=\\"10\\" y=\\"80\\" font-size=\\"8\\">A</text></svg> What shape is drawn?"
`;
  } else if (!isScience && !includeDiagrams) {
    // Exclude diagrams
    prompt += `
\n
### IMPORTANT INSTRUCTION:
Do NOT generate or embed any SVG diagram or visual aid inside the "question_text" string. All questions must rely purely on written description without using any SVG shapes.
`;
  } else {
    // Append Science diagram instructions to prevent SVGs in question text and promote student drawing
    prompt += `
\n
### IMPORTANT SCIENCE DIAGRAM & QUESTION STYLE INSTRUCTION:
1. **No SVGs in Questions**: Do NOT generate or embed any SVG diagram inside the "question_text" string. All Science diagrams (such as circuit diagrams, ray diagrams, experimental setups, organ diagrams) MUST be drawn by the student.
2. **Direct Student Drawing**: Phrase your questions to explicitly instruct the students to draw, label, or complete the diagrams themselves (e.g. "Draw a schematic diagram of a circuit consisting of...", "Redraw the circuit, putting in an ammeter to measure...", "Draw a labeled ray diagram showing...").
3. **Formal Exam-Style Phrasing**: Keep all questions professional, direct, and formal. Do NOT use hypothetical/imaginative start phrases like "Imagine a...", "Consider a...", "Suppose a...", or "Assume we have...". Instead, state the parameters directly (e.g., "A circuit consists of a battery...", "Calculate the reading of...").
`;
  }

  if (additionalNotes) {
    prompt += `\n\n### ADDITIONAL CUSTOMIZATION INSTRUCTIONS:\nThe user has requested these specific constraints/directions for the questions. You MUST strictly adhere to them:
- ${additionalNotes}\n`;
  }

  const { genAI, modelName } = getGeminiClient();
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            question_number: { type: SchemaType.INTEGER },
            question_text: { type: SchemaType.STRING },
            marks: { type: SchemaType.INTEGER },
            solution: { type: SchemaType.STRING }
          },
          required: ["question_number", "question_text", "marks", "solution"]
        }
      }
    },
  });

  const response = await model.generateContent(prompt);
  const jsonText = response.response.text();

  try {
    const cleanedText = cleanJsonText(jsonText);
    return JSON.parse(cleanedText) as GeneratedQuestionResponse[];
  } catch (err) {
    console.error('Failed to parse Gemini question generation response:', jsonText);
    throw new Error('Gemini question output was not valid JSON.');
  }
}
