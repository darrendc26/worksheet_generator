/// <reference path="../types/declarations.d.ts" />
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import { createHash } from 'crypto';

import { supabase } from '../db';
import { parseFilename, normalizeSubject } from '../utils/filenameParser';
import { analyzeAndChunkChapter, generateQuestions, GeneratedQuestionResponse } from '../services/geminiService';
import { generateWorksheetPdf, generateAnswerKeyPdf } from '../services/pdfService';
import { uploadPdfBuffer } from '../services/storageService';
import { PROMPT_VERSION } from '../prompts/promptVersions';
import { startBot, getBotStatus } from '../bot'; // We will implement this next

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Serve static assets from public folder
app.use(express.static(path.resolve(process.cwd(), 'public')));

// Configure Multer for PDF file uploads (in-memory storage)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit to support large textbook chapters
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are supported.'));
    }
  },
});

/**
 * POST /api/chapters/upload
 * Accepts a PDF file via multipart/form-data upload, parses metadata, extracts text,
 * invokes Gemini to chunk and summarize, then saves both to Supabase.
 */
app.post('/api/chapters/upload', upload.single('pdf'), async (req: any, res: any) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No PDF file uploaded.' });
    }

    // 1. Parse filename metadata and allow manual override from body
    const filenameMetadata = parseFilename(file.originalname);
    const rawSubject = req.body.subject || filenameMetadata.subject;
    const subject = normalizeSubject(rawSubject);
    const classLevel = req.body.class || filenameMetadata.class;
    const board = req.body.board || filenameMetadata.board;
    const chapterName = req.body.chapter_name || filenameMetadata.chapter_name;

    console.log(`Processing file: ${file.originalname}`);
    console.log(`Metadata: Subject=${subject}, Class=${classLevel}, Board=${board}, Chapter=${chapterName}`);

    // 2. Extract raw text from PDF buffer server-side
    let rawText = '';
    try {
      const pdfData = await pdfParse(file.buffer);
      rawText = pdfData.text || '';
    } catch (parseErr) {
      console.warn('pdfParse failed, treating as potential scanned PDF:', parseErr);
    }

    let analysisResult;
    if (!rawText || rawText.trim().length < 100) {
      console.log('Very little or no text extracted from PDF. Treating as scanned/image-based PDF and passing directly to Gemini...');
      const base64Data = file.buffer.toString('base64');
      analysisResult = await analyzeAndChunkChapter(
        { mimeType: 'application/pdf', data: base64Data },
        subject
      );
    } else {
      console.log('Text-layered PDF detected. Analyzing raw extracted text...');
      analysisResult = await analyzeAndChunkChapter(rawText, subject);
    }

    // Check if the chapter already exists to prevent duplicate entries
    const { data: existingChapter } = await supabase
      .from('chapters')
      .select('id, chapter_name')
      .eq('chapter_name', chapterName)
      .eq('subject', subject)
      .eq('class', classLevel)
      .eq('board', board)
      .maybeSingle();

    if (existingChapter) {
      console.log(`Chapter "${chapterName}" already exists. Skipping duplicate database write.`);
      return res.status(200).json({
        message: 'Chapter already exists in the database. Skipped duplication.',
        chapter: existingChapter,
        chunks_count: 0
      });
    }


    const { data: chapterData, error: chapterError } = await supabase
      .from('chapters')
      .insert({
        subject,
        class: classLevel,
        board,
        chapter_name: chapterName,
        summary: analysisResult.summary,
      })
      .select()
      .single();

    if (chapterError) {
      console.error('Error inserting chapter:', chapterError);
      return res.status(500).json({ error: `Database insert failed: ${chapterError.message}` });
    }

    // 5. Save semantic chunks in bulk

    const chunksToInsert = analysisResult.chunks.map((chunk, index) => ({
      chapter_id: chapterData.id,
      chunk_title: chunk.chunk_title,
      chunk_content: chunk.chunk_content,
      chunk_order: index + 1,
      chunk_type: chunk.chunk_type,
    }));

    const { error: chunksError } = await supabase
      .from('chunks')
      .insert(chunksToInsert);

    if (chunksError) {
      console.error('Error inserting chunks:', chunksError);
      // Clean up chapter if chunks failed
      await supabase.from('chapters').delete().eq('id', chapterData.id);
      return res.status(500).json({ error: `Database chunk insertion failed: ${chunksError.message}` });
    }


    return res.status(201).json({
      message: 'Chapter uploaded, summarized, and chunked successfully.',
      chapter: chapterData,
      chunks_count: chunksToInsert.length,
    });
  } catch (err: any) {
    console.error('Upload handler error:', err);
    return res.status(500).json({ error: err.message || 'An unexpected error occurred during processing.' });
  }
});

/**
 * GET /api/chapters
 * Lists all chapters with option to filter by subject or board.
 */
app.get('/api/chapters', async (req: any, res: any) => {
  try {
    let query = supabase.from('chapters').select('*');
    
    if (req.query.subject) {
      query = query.ilike('subject', req.query.subject);
    }
    if (req.query.board) {
      query = query.ilike('board', req.query.board);
    }
    if (req.query.class) {
      query = query.ilike('class', req.query.class);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    
    if (error) throw error;
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/chapters/:id
 * Fetches specific chapter summary details along with its text chunks.
 */
app.get('/api/chapters/:id', async (req: any, res: any) => {
  try {
    const { data: chapter, error: chapterError } = await supabase
      .from('chapters')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (chapterError || !chapter) {
      return res.status(404).json({ error: 'Chapter not found.' });
    }

    const { data: chunks, error: chunksError } = await supabase
      .from('chunks')
      .select('*')
      .eq('chapter_id', req.params.id)
      .order('chunk_order', { ascending: true });

    if (chunksError) throw chunksError;

    return res.json({
      ...chapter,
      chunks,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/chapters/:id
 * Deletes a chapter by its ID. Cascades deletion of related chunks and worksheets.
 */
app.delete('/api/chapters/:id', async (req: any, res: any) => {
  try {
    const { id } = req.params;
    
    // Perform delete in Supabase chapters table
    const { error } = await supabase
      .from('chapters')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return res.json({ message: 'Chapter deleted successfully.' });
  } catch (err: any) {
    console.error('Delete chapter error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/chapters/:id
 * Updates metadata tags for an existing chapter (chapter_name, subject, class, board).
 */
app.put('/api/chapters/:id', async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { chapter_name, subject, class: classLevel, board } = req.body;

    if (!chapter_name || !subject || !classLevel || !board) {
      return res.status(400).json({ error: 'All fields (chapter_name, subject, class, board) are required.' });
    }

    const normalizedSubject = normalizeSubject(subject);

    const { data: updatedChapter, error } = await supabase
      .from('chapters')
      .update({
        chapter_name: chapter_name.trim(),
        subject: normalizedSubject,
        class: classLevel.trim(),
        board: board.trim()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating chapter:', error);
      return res.status(500).json({ error: `Database update failed: ${error.message}` });
    }

    return res.status(200).json({
      message: 'Chapter metadata updated successfully.',
      chapter: updatedChapter
    });
  } catch (err: any) {
    console.error('Server error during chapter update:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});


/**
 * POST /api/worksheets/generate
 * Generates custom assessments using cached items. Checks MD5 hash of parameters
 * against generated_worksheets.
 */
app.post('/api/worksheets/generate', async (req: any, res: any) => {
  try {
    const { chapter_id, chapter_ids, difficulty, question_count, generation_mode, key_format, include_diagrams, additional_notes } = req.body;

    // Resolve chapterIds array (fallback to chapter_id array if chapter_ids array is not passed)
    const chapterIds: string[] = chapter_ids || (chapter_id ? [chapter_id] : null);

    if (!chapterIds || !Array.isArray(chapterIds) || chapterIds.length === 0 || !difficulty || !question_count || !generation_mode) {
      return res.status(400).json({ error: 'Missing required parameters: chapter_ids or chapter_id, difficulty, question_count, generation_mode' });
    }

    const keyFormat = key_format || 'embed'; // 'none' | 'embed' | 'separate'
    const includeDiagrams = include_diagrams !== false; // default to true

    // 1. Calculate MD5 hash for caching check (includes sorted chapter IDs, prompt version, mode, key format, include diagrams, and additional notes)
    const sortedChapterIds = [...chapterIds].sort();
    const notesClean = (additional_notes || '').trim().toLowerCase();
    const hash = createHash('md5')
      .update(`${sortedChapterIds.join(',')}_${difficulty.toLowerCase()}_${question_count}_${PROMPT_VERSION}_${generation_mode.toLowerCase()}_${keyFormat}_${includeDiagrams}_${notesClean}`)
      .digest('hex');

    // 2. Check Cache
    const { data: cachedWorksheet, error: cacheError } = await supabase
      .from('generated_worksheets')
      .select('*')
      .eq('hash', hash)
      .maybeSingle();

    if (cachedWorksheet) {
      console.log('Serving cached worksheet URL:', cachedWorksheet.pdf_url);
      const urls = cachedWorksheet.pdf_url.split('|');
      return res.json({
        message: 'Loaded cached worksheet.',
        pdf_url: urls[0],
        key_pdf_url: urls[1] || null,
        is_cached: true,
      });
    }

    // Cache Miss -> Generate New Worksheet
    console.log(`Cache miss for hash: ${hash}. Generating worksheet...`);
    
    // Fetch chapters & chunks in bulk
    const { data: chaptersData, error: chaptersError } = await supabase
      .from('chapters')
      .select('*')
      .in('id', chapterIds);

    if (chaptersError || !chaptersData || chaptersData.length === 0) {
      return res.status(404).json({ error: 'Chapters not found.' });
    }

    // Sort chaptersData to match the input chapterIds order
    const orderedChapters = chapterIds
      .map(id => chaptersData.find(c => c.id === id))
      .filter(Boolean) as any[];

    if (orderedChapters.length === 0) {
      return res.status(404).json({ error: 'Chapters could not be ordered.' });
    }

    const { data: chunks, error: chunksError } = await supabase
      .from('chunks')
      .select('*')
      .in('chapter_id', chapterIds);

    if (chunksError || !chunks || chunks.length === 0) {
      return res.status(422).json({ error: 'No textbook chunks found for the selected chapters. Cannot generate worksheet.' });
    }

    // Group info for prompts
    const chapterNames = orderedChapters.map(c => c.chapter_name);
    const summaries = orderedChapters.map(c => c.summary);
    
    // Group chapters by subject (normalized)
    const subjectsMap = new Map<string, typeof orderedChapters>();
    for (const chap of orderedChapters) {
      const sub = chap.subject;
      if (!subjectsMap.has(sub)) {
        subjectsMap.set(sub, []);
      }
      subjectsMap.get(sub)!.push(chap);
    }

    const subjects = Array.from(subjectsMap.keys());
    let allQuestions: GeneratedQuestionResponse[] = [];
    
    const baseChapter = orderedChapters[0];
    const classLevel = baseChapter.class || 'N/A';
    const board = baseChapter.board;
    let subject = baseChapter.subject;

    if (subjects.length <= 1) {
      // Single subject generation (identical to current behavior)
      const questions = await generateQuestions(
        subject,
        classLevel,
        board,
        chapterNames,
        summaries,
        chunks,
        difficulty,
        Number(question_count),
        generation_mode,
        additional_notes,
        includeDiagrams
      );
      allQuestions = questions;
    } else {
      // Multi-subject generation (split questions and generate separately per subject)
      subject = subjects.join(' & ');
      let remainingQuestions = Number(question_count);
      const totalChapters = orderedChapters.length;
      let questionIndex = 1;
      
      for (let i = 0; i < subjects.length; i++) {
        const sub = subjects[i];
        const subChapters = subjectsMap.get(sub)!;
        const subChapterNames = subChapters.map(c => c.chapter_name);
        const subSummaries = subChapters.map(c => c.summary);
        
        // Filter chunks belonging to this subject's chapters
        const subChapterIds = new Set(subChapters.map(c => c.id));
        const subChunks = chunks.filter(c => subChapterIds.has(c.chapter_id));

        // Determine question count for this subject
        let subCount = Math.round((Number(question_count) * subChapters.length) / totalChapters);
        if (i === subjects.length - 1) {
          subCount = remainingQuestions; // last subject gets all remaining questions
        } else {
          subCount = Math.max(1, subCount);
          remainingQuestions -= subCount;
        }

        const subQuestions = await generateQuestions(
          sub,
          classLevel,
          board,
          subChapterNames,
          subSummaries,
          subChunks,
          difficulty,
          subCount,
          generation_mode,
          additional_notes,
          includeDiagrams
        );

        // Map sectionName and update question index
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const sectionLetter = alphabet[i] || String(i + 1);
        const sectionTitle = `Section ${sectionLetter}: ${sub}`;

        subQuestions.forEach((q, idx) => {
          q.question_number = questionIndex++;
          if (idx === 0) {
            q.sectionName = sectionTitle;
          }
          allQuestions.push(q);
        });
      }
    }

    if (!allQuestions || allQuestions.length === 0) {
      return res.status(500).json({ error: 'Gemini service failed to generate questions.' });
    }

    // Set variable referenced by subsequent code
    const questions = allQuestions;

    let pdfUrl = '';
    let keyPdfUrl = '';

    if (keyFormat === 'separate') {
      // 4a. Create printable PDF buffer WITHOUT answer key
      const pdfBuffer = await generateWorksheetPdf(
        subject,
        classLevel,
        board,
        chapterNames,
        difficulty,
        generation_mode,
        questions,
        false
      );

      // Upload Worksheet PDF to Supabase Storage
      pdfUrl = await uploadPdfBuffer(
        pdfBuffer,
        `${chapterNames[0].replace(/\s+/g, '_')}_combined_${difficulty}`
      );

      // 4b. Create separate Answer Key PDF buffer
      const keyPdfBuffer = await generateAnswerKeyPdf(
        subject,
        classLevel,
        board,
        chapterNames,
        questions
      );

      // Upload Answer Key PDF to Supabase Storage
      keyPdfUrl = await uploadPdfBuffer(
        keyPdfBuffer,
        `${chapterNames[0].replace(/\s+/g, '_')}_combined_${difficulty}_answer_key`
      );
    } else {
      // Create printable PDF buffer (embed key only if format is 'embed')
      const includeKey = (keyFormat === 'embed');
      const pdfBuffer = await generateWorksheetPdf(
        subject,
        classLevel,
        board,
        chapterNames,
        difficulty,
        generation_mode,
        questions,
        includeKey
      );

      // Upload PDF to Supabase Storage
      pdfUrl = await uploadPdfBuffer(
        pdfBuffer,
        `${chapterNames[0].replace(/\s+/g, '_')}_combined_${difficulty}`
      );
    }

    // Save separate/embedded URLs by separating with a delimiter
    const savedUrl = keyPdfUrl ? `${pdfUrl}|${keyPdfUrl}` : pdfUrl;

    // 6. Save worksheet entry in Database
    const { data: worksheetData, error: insertError } = await supabase
      .from('generated_worksheets')
      .insert({
        hash,
        chapter_id: chapterIds[0], // Set first chapter for backward compatibility
        chapter_ids: chapterIds,
        difficulty,
        question_count: Number(question_count),
        generation_mode,
        prompt_version: PROMPT_VERSION,
        pdf_url: savedUrl,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error saving worksheet record:', insertError);
      return res.status(500).json({ error: `Failed to save generated worksheet to database: ${insertError.message}` });
    }

    return res.json({
      message: 'Worksheet generated and uploaded successfully.',
      pdf_url: pdfUrl,
      key_pdf_url: keyPdfUrl || null,
      is_cached: false,
    });
  } catch (err: any) {
    console.error('Worksheet generation error:', err);
    return res.status(500).json({ error: err.message || 'An unexpected error occurred during worksheet generation.' });
  }
});

/**
 * GET /api/stats
 * Aggregates dashboard numbers: counts of chapters, worksheets, chunks, subjects.
 */
app.get('/api/stats', async (req: any, res: any) => {
  try {
    const [chaptersCount, worksheetsCount, chunksCount, subjectsData] = await Promise.all([
      supabase.from('chapters').select('*', { count: 'exact', head: true }),
      supabase.from('generated_worksheets').select('*', { count: 'exact', head: true }),
      supabase.from('chunks').select('*', { count: 'exact', head: true }),
      supabase.from('chapters').select('subject'),
    ]);

    // Calculate unique subjects list
    const subjects = subjectsData.data ? Array.from(new Set(subjectsData.data.map(x => x.subject))) : [];

    return res.json({
      chapters: chaptersCount.count || 0,
      worksheets: worksheetsCount.count || 0,
      chunks: chunksCount.count || 0,
      subjects: subjects.length,
      subjects_list: subjects,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/bot/status
 * Returns connection and metadata for the Telegram Bot.
 */
app.get('/api/bot/status', (req: any, res: any) => {
  try {
    const status = getBotStatus();
    return res.json(status);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Express error-handling middleware to intercept Multer and general errors gracefully
app.use((err: any, req: any, res: any, next: any) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File is too large. Maximum size allowed is 100MB.' });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  if (err) {
    return res.status(err.status || 500).json({ error: err.message || 'An unexpected error occurred.' });
  }
  next();
});

// Clean up existing mismatched subject records on startup
async function cleanupMismatchedSubjects() {
  try {
    // 1. Normalize Math
    const { error: mathErr } = await supabase
      .from('chapters')
      .update({ subject: 'Mathematics' })
      .in('subject', ['math', 'maths', 'Maths', 'Math', 'mathematics']);

    if (mathErr) {
      console.warn('Math subject normalization startup warning:', mathErr.message);
    }

    // 2. Normalize Social Science
    const { error: socialErr } = await supabase
      .from('chapters')
      .update({ subject: 'Social Science' })
      .in('subject', [
        'history', 'geography', 'civics', 'social studies', 'social science', 'social', 
        'History', 'Geography', 'Civics', 'Social Studies', 'Social Science', 'Social',
        'social_science', 'Social_Science'
      ]);

    if (socialErr) {
      console.warn('Social Science subject normalization startup warning:', socialErr.message);
    }

    console.log('Database subjects normalized successfully.');
  } catch (err: any) {
    console.warn('Startup database subject cleanup failed:', err.message);
  }
}

// Start Express Server
cleanupMismatchedSubjects().then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  });
});

// Boot Telegram Bot in background
startBot(app as any).catch((err) => {
  console.error('CRITICAL: Telegram Bot failed to launch:', err);
});
