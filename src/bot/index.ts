import { Telegraf, Markup } from 'telegraf';
import express from 'express';
import dotenv from 'dotenv';
import { createHash } from 'crypto';
import { supabase } from '../db';
import { PROMPT_VERSION } from '../prompts/promptVersions';
import { generateQuestions } from '../services/geminiService';
import { generateWorksheetPdf, generateAnswerKeyPdf } from '../services/pdfService';
import { uploadPdfBuffer } from '../services/storageService';
import { Chunk } from '../types';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;

let botInfo = { username: '', name: '', isOnline: false };

export function getBotStatus() {
  return botInfo;
}

interface BotSession {
  selectedChapterIds: string[];
  difficulty: string;
  questionCount: number;
  generationMode: string;
  additionalNotes: string;
  step: 'idle' | 'awaiting_count' | 'awaiting_notes';
  activeClass: string;
  activeBoard: string;
  activeSubject: string;
  includeDiagrams: boolean;
  keyFormat: 'embed' | 'separate' | 'none';
}

const sessions = new Map<number, BotSession>();

function getSession(userId: number): BotSession {
  if (!sessions.has(userId)) {
    sessions.set(userId, {
      selectedChapterIds: [],
      difficulty: 'Medium',
      questionCount: 10,
      generationMode: 'revision',
      additionalNotes: '',
      step: 'idle',
      activeClass: '',
      activeBoard: '',
      activeSubject: '',
      includeDiagrams: true,
      keyFormat: 'embed'
    });
  }
  return sessions.get(userId)!;
}

/**
 * Initializes and starts the Telegram Bot.
 * Safely fails if token is missing.
 */
export async function startBot(app?: express.Application): Promise<void> {
  if (!token || token === 'your_telegram_bot_token_here') {
    console.warn('WARNING: TELEGRAM_BOT_TOKEN is missing or placeholder. Telegram Bot will not start.');
    return;
  }

  const bot = new Telegraf(token);

  bot.telegram.getMe().then((me) => {
    botInfo = {
      username: me.username || '',
      name: me.first_name || '',
      isOnline: true
    };
    console.log(`Telegram Bot successfully connected: @${me.username}`);
  }).catch(err => {
    console.error('Failed to get Telegram Bot info:', err);
  });

  // Command: /start
  bot.command('start', async (ctx) => {
    try {
      const welcomeMessage = 
        `📚 <b>Welcome to the Dicksy Tuition Centre Worksheet Generator!</b>\n\n` +
        `I am your AI learning assistant. I can fetch chapter summaries, formulas, important historical dates, and generate printable PDF worksheets tailored to your subjects.\n\n` +
        `Click below to start browsing our library:`;

      await ctx.replyWithHTML(
        welcomeMessage,
        Markup.inlineKeyboard([
          [Markup.button.callback('🔍 Browse Classes', 'list_classes')],
          [Markup.button.callback('ℹ️ Help & FAQ', 'show_help')]
        ])
      );
    } catch (err) {
      console.error('Start command error:', err);
    }
  });

  // Action: list_classes
  bot.action('list_classes', async (ctx) => {
    try {
      const { data: chapters, error } = await supabase
        .from('chapters')
        .select('class');

      if (error) throw error;

      if (!chapters || chapters.length === 0) {
        return ctx.reply(
          'No chapters have been uploaded to the library yet. Please use the Bulk Upload Web Dashboard to add learning material.',
          Markup.inlineKeyboard([[Markup.button.callback('🔙 Main Menu', 'go_start')]])
        );
      }

      // Normalize class names and filter duplicates
      const classesSet = new Set<string>();
      for (const ch of chapters) {
        const cls = (ch.class || '').trim();
        classesSet.add(cls || 'Other');
      }
      const classes = Array.from(classesSet).sort((a, b) => {
        if (a === 'Other') return 1;
        if (b === 'Other') return -1;
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
      });

      const keyboardButtons = classes.map((cls) => [
        Markup.button.callback(`🎓 ${cls}`, `class:${cls}`)
      ]);
      keyboardButtons.push([Markup.button.callback('🔙 Main Menu', 'go_start')]);

      await ctx.editMessageText('🎓 <b>Select a Class / Grade:</b>', {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(keyboardButtons)
      });
      await ctx.answerCbQuery();
    } catch (err: any) {
      console.error('List classes error:', err);
      await ctx.reply(`Failed to load classes: ${err.message}`);
    }
  });

  // Action: class:<class_name>
  bot.action(/^class:(.+)$/, async (ctx) => {
    try {
      const className = ctx.match[1];
      const session = getSession(ctx.from!.id);
      session.activeClass = className;
      session.activeBoard = '';
      session.activeSubject = '';

      await renderBoardsList(ctx);
      await ctx.answerCbQuery();
    } catch (err: any) {
      console.error('Class selection handler error:', err);
    }
  });

  // Action: board:<board_name>
  bot.action(/^board:(.+)$/, async (ctx) => {
    try {
      const boardName = ctx.match[1];
      const session = getSession(ctx.from!.id);
      session.activeBoard = boardName;
      session.activeSubject = '';

      await renderSubjectsList(ctx);
      await ctx.answerCbQuery();
    } catch (err: any) {
      console.error('Board selection handler error:', err);
    }
  });

  // Action: list_boards_menu
  bot.action('list_boards_menu', async (ctx) => {
    try {
      await renderBoardsList(ctx);
      await ctx.answerCbQuery();
    } catch (err) {
      console.error(err);
    }
  });

  // Action: list_subjects_menu
  bot.action('list_subjects_menu', async (ctx) => {
    try {
      await renderSubjectsList(ctx);
      await ctx.answerCbQuery();
    } catch (err) {
      console.error(err);
    }
  });

  // Action: subject:<subject_name>
  bot.action(/^subject:(.+)$/, async (ctx) => {
    try {
      const subjectName = ctx.match[1];
      const session = getSession(ctx.from!.id);
      session.activeSubject = subjectName;

      await renderChaptersList(ctx);
      await ctx.answerCbQuery();
    } catch (err: any) {
      console.error('Subject selection handler error:', err);
    }
  });

  // Action: toggle_chap:<chapter_id>
  bot.action(/^toggle_chap:(.+)$/, async (ctx) => {
    try {
      const chapterId = ctx.match[1];
      const session = getSession(ctx.from!.id);
      
      const idx = session.selectedChapterIds.indexOf(chapterId);
      if (idx === -1) {
        session.selectedChapterIds.push(chapterId);
      } else {
        session.selectedChapterIds.splice(idx, 1);
      }
      
      await renderChaptersList(ctx);
      await ctx.answerCbQuery();
    } catch (err: any) {
      console.error('Toggle chapter error:', err);
    }
  });

  // Action: clear_selection
  bot.action('clear_selection', async (ctx) => {
    try {
      const session = getSession(ctx.from!.id);
      session.selectedChapterIds = [];
      await renderChaptersList(ctx);
      await ctx.answerCbQuery('Selection cleared.');
    } catch (err: any) {
      console.error('Clear selection error:', err);
    }
  });

  // Action: go_to_chapters
  bot.action('go_to_chapters', async (ctx) => {
    try {
      await renderChaptersList(ctx);
      await ctx.answerCbQuery();
    } catch (err: any) {
      console.error(err);
    }
  });

  // Action: view_sum:<chapter_id>
  bot.action(/^view_sum:(.+)$/, async (ctx) => {
    try {
      const chapterId = ctx.match[1];

      const { data: chapter, error } = await supabase
        .from('chapters')
        .select('*')
        .eq('id', chapterId)
        .single();

      if (error || !chapter) {
        return ctx.reply('Chapter summary not found.');
      }

      const summaryHtml = formatSummaryHtml(chapter);

      await ctx.editMessageText(summaryHtml, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔙 Back to Chapters', 'go_to_chapters')]
        ])
      });
      await ctx.answerCbQuery();
    } catch (err: any) {
      console.error('View summary error:', err);
    }
  });

  // Action: go_configure
  bot.action('go_configure', async (ctx) => {
    try {
      await goConfigureHandler(ctx);
      await ctx.answerCbQuery();
    } catch (err: any) {
      console.error('Go configure error:', err);
    }
  });

  // Action: change_diff
  bot.action('change_diff', async (ctx) => {
    try {
      await ctx.editMessageText('📊 <b>Select Difficulty Level:</b>', {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('🟢 Easy', 'set_diff:Easy'),
            Markup.button.callback('🟡 Medium', 'set_diff:Medium'),
            Markup.button.callback('🔴 Hard', 'set_diff:Hard')
          ],
          [Markup.button.callback('🔙 Back to Settings', 'go_configure')]
        ])
      });
      await ctx.answerCbQuery();
    } catch (err: any) {
      console.error(err);
    }
  });

  // Action: set_diff:<difficulty>
  bot.action(/^set_diff:(Easy|Medium|Hard)$/, async (ctx) => {
    try {
      const session = getSession(ctx.from!.id);
      session.difficulty = ctx.match[1];
      await goConfigureHandler(ctx);
      await ctx.answerCbQuery(`Difficulty set to ${session.difficulty}`);
    } catch (err: any) {
      console.error(err);
    }
  });

  // Action: change_count
  bot.action('change_count', async (ctx) => {
    try {
      await ctx.editMessageText('🔢 <b>Select Question Count:</b>', {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('5 Qs', 'set_count:5'),
            Markup.button.callback('10 Qs', 'set_count:10'),
            Markup.button.callback('15 Qs', 'set_count:15')
          ],
          [
            Markup.button.callback('20 Qs', 'set_count:20'),
            Markup.button.callback('📝 Custom Count', 'ask_custom_count')
          ],
          [Markup.button.callback('🔙 Back to Settings', 'go_configure')]
        ])
      });
      await ctx.answerCbQuery();
    } catch (err: any) {
      console.error(err);
    }
  });

  // Action: set_count:<count>
  bot.action(/^set_count:(\d+)$/, async (ctx) => {
    try {
      const session = getSession(ctx.from!.id);
      session.questionCount = Number(ctx.match[1]);
      await goConfigureHandler(ctx);
      await ctx.answerCbQuery(`Count set to ${session.questionCount}`);
    } catch (err: any) {
      console.error(err);
    }
  });

  // Action: ask_custom_count
  bot.action('ask_custom_count', async (ctx) => {
    try {
      const session = getSession(ctx.from!.id);
      session.step = 'awaiting_count';
      await ctx.editMessageText('🔢 <b>Type your custom question count</b> (between 1 and 40) and send it as a message reply here:', {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Cancel', 'go_configure')]])
      });
      await ctx.answerCbQuery();
    } catch (err: any) {
      console.error(err);
    }
  });

  // Action: change_mode
  bot.action('change_mode', async (ctx) => {
    try {
      await ctx.editMessageText('⚙️ <b>Select Generation Mode:</b>', {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Practice Solved Examples (Maths)', 'set_mode:similarity')],
          [Markup.button.callback('🔒 Strictly From Book Only (History/Geo)', 'set_mode:strict_grounded')],
          [Markup.button.callback('📚 Balanced Revision Test', 'set_mode:revision')],
          [Markup.button.callback('🏆 HOTS / Advanced Challenge', 'set_mode:challenge')],
          [Markup.button.callback('🌱 Basics & Foundation Builder', 'set_mode:weak_foundation')],
          [Markup.button.callback('🔙 Back to Settings', 'go_configure')]
        ])
      });
      await ctx.answerCbQuery();
    } catch (err: any) {
      console.error(err);
    }
  });

  // Action: set_mode:<mode>
  bot.action(/^set_mode:(similarity|strict_grounded|revision|challenge|weak_foundation)$/, async (ctx) => {
    try {
      const session = getSession(ctx.from!.id);
      session.generationMode = ctx.match[1];
      await goConfigureHandler(ctx);
      await ctx.answerCbQuery(`Mode set.`);
    } catch (err: any) {
      console.error(err);
    }
  });

  // Action: change_notes
  bot.action('change_notes', async (ctx) => {
    try {
      const session = getSession(ctx.from!.id);
      session.step = 'awaiting_notes';
      await ctx.editMessageText('✍️ <b>Type your custom notes / instructions</b> (e.g. "dont add questions on division algorithm") and send it as a message reply here:', {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('❌ Clear Notes', 'clear_notes')],
          [Markup.button.callback('🔙 Cancel', 'go_configure')]
        ])
      });
      await ctx.answerCbQuery();
    } catch (err: any) {
      console.error(err);
    }
  });

  // Action: clear_notes
  bot.action('clear_notes', async (ctx) => {
    try {
      const session = getSession(ctx.from!.id);
      session.additionalNotes = '';
      session.step = 'idle';
      await goConfigureHandler(ctx);
      await ctx.answerCbQuery('Custom notes cleared.');
    } catch (err: any) {
      console.error(err);
    }
  });

  // Action: toggle_diagrams
  bot.action('toggle_diagrams', async (ctx) => {
    try {
      const session = getSession(ctx.from!.id);
      session.includeDiagrams = !session.includeDiagrams;
      await goConfigureHandler(ctx);
      await ctx.answerCbQuery(`Diagrams set to ${session.includeDiagrams ? 'Yes' : 'No'}`);
    } catch (err) {
      console.error(err);
    }
  });

  // Action: change_key_format
  bot.action('change_key_format', async (ctx) => {
    try {
      await ctx.editMessageText('🔑 <b>Select Answer Key Option:</b>', {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('📥 Embed at the End (Single PDF)', 'set_key:embed')],
          [Markup.button.callback('📄 Generate as Separate PDF', 'set_key:separate')],
          [Markup.button.callback('❌ No Answer Key', 'set_key:none')],
          [Markup.button.callback('🔙 Back to Settings', 'go_configure')]
        ])
      });
      await ctx.answerCbQuery();
    } catch (err) {
      console.error(err);
    }
  });

  // Action: set_key:<format>
  bot.action(/^set_key:(embed|separate|none)$/, async (ctx) => {
    try {
      const session = getSession(ctx.from!.id);
      session.keyFormat = ctx.match[1] as any;
      await goConfigureHandler(ctx);
      await ctx.answerCbQuery(`Answer key option set.`);
    } catch (err) {
      console.error(err);
    }
  });

  // Action: restart_session
  bot.action('restart_session', async (ctx) => {
    try {
      const session = getSession(ctx.from!.id);
      session.selectedChapterIds = [];
      session.difficulty = 'Medium';
      session.questionCount = 10;
      session.generationMode = 'revision';
      session.additionalNotes = '';
      session.step = 'idle';
      session.includeDiagrams = true;
      session.keyFormat = 'embed';
      
      await ctx.editMessageText(
        `📚 <b>Welcome to the Dicksy Tuition Centre Worksheet Generator!</b>\n\n` +
        `I am your AI learning assistant. Choose from the menu below to start:`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔍 Browse Classes', 'list_classes')],
            [Markup.button.callback('ℹ️ Help & FAQ', 'show_help')]
          ])
        }
      );
      await ctx.answerCbQuery('Session restarted.');
    } catch (err: any) {
      console.error(err);
    }
  });

  // Action: trigger_generation_flow
  bot.action('trigger_generation_flow', async (ctx) => {
    const session = getSession(ctx.from!.id);
    if (session.selectedChapterIds.length === 0) {
      return ctx.answerCbQuery('⚠️ No chapters selected.');
    }

    try {
      await ctx.editMessageText('⚙️ <b>Generating your worksheet PDF...</b>\nThis takes a few seconds as Gemini designs and writes your questions. Please wait.', {
        parse_mode: 'HTML'
      });

      // 1. Fetch chapters & chunks
      const { data: chaptersData } = await supabase
        .from('chapters')
        .select('*')
        .in('id', session.selectedChapterIds);

      const { data: chunks } = await supabase
        .from('chunks')
        .select('*')
        .in('chapter_id', session.selectedChapterIds);

      if (!chaptersData || chaptersData.length === 0 || !chunks || chunks.length === 0) {
        return ctx.reply('Error: Chapters or chunks could not be retrieved from the database.');
      }

      // Group chapters by subject (normalized)
      const subjectsMap = new Map<string, any[]>();
      for (const chap of chaptersData) {
        const sub = chap.subject;
        if (!subjectsMap.has(sub)) {
          subjectsMap.set(sub, []);
        }
        subjectsMap.get(sub)!.push(chap);
      }
      const subjects = Array.from(subjectsMap.keys());
      let allQuestions: any[] = [];
      
      const baseChapter = chaptersData[0];
      const classLevel = baseChapter.class || 'N/A';
      const board = baseChapter.board;
      let subject = baseChapter.subject;
      const chapterNames = chaptersData.map(c => c.chapter_name);
      const summaries = chaptersData.map(c => c.summary);

      // 2. MD5 Cache Key (sorted IDs, difficulty, count, prompt version, mode, key format, include diagrams, additional notes)
      const sortedChapterIds = [...session.selectedChapterIds].sort();
      const notesClean = (session.additionalNotes || '').trim().toLowerCase();
      const hash = createHash('md5')
        .update(`${sortedChapterIds.join(',')}_${session.difficulty.toLowerCase()}_${session.questionCount}_${PROMPT_VERSION}_${session.generationMode.toLowerCase()}_${session.keyFormat}_${session.includeDiagrams}_${notesClean}`)
        .digest('hex');

      // 3. Check Cache
      const { data: cachedWorksheet } = await supabase
        .from('generated_worksheets')
        .select('pdf_url')
        .eq('hash', hash)
        .maybeSingle();

      if (cachedWorksheet) {
        await ctx.editMessageText('✅ <b>Worksheet retrieved from cache! Sending file(s)...</b>', { parse_mode: 'HTML' });
        const urls = cachedWorksheet.pdf_url.split('|');
        await ctx.replyWithDocument(
          { url: urls[0], filename: getWorksheetFilename(chapterNames, 'Worksheet') }
        );
        if (urls[1]) {
          await ctx.replyWithDocument(
            { url: urls[1], filename: getWorksheetFilename(chapterNames, 'Answer_Key') }
          );
        }
        return;
      }

      // 4. Generate questions
      if (subjects.length <= 1) {
        // Single subject
        allQuestions = await generateQuestions(
          subject,
          classLevel,
          board,
          chapterNames,
          summaries,
          chunks,
          session.difficulty,
          session.questionCount,
          session.generationMode,
          session.additionalNotes,
          session.includeDiagrams
        );
      } else {
        // Multi-subject
        subject = subjects.join(' & ');
        let remainingQuestions = session.questionCount;
        const totalChapters = chaptersData.length;
        let questionIndex = 1;

        for (let i = 0; i < subjects.length; i++) {
          const sub = subjects[i];
          const subChapters = subjectsMap.get(sub)!;
          const subChapterNames = subChapters.map(c => c.chapter_name);
          const subSummaries = subChapters.map(c => c.summary);

          const subChapterIds = new Set(subChapters.map(c => c.id));
          const subChunks = chunks.filter(c => subChapterIds.has(c.chapter_id));

          let subCount = Math.round((session.questionCount * subChapters.length) / totalChapters);
          if (i === subjects.length - 1) {
            subCount = remainingQuestions;
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
            session.difficulty,
            subCount,
            session.generationMode,
            session.additionalNotes,
            session.includeDiagrams
          );

          const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
          const sectionLetter = alphabet[i] || String(i + 1);
          const sectionTitle = `Section ${sectionLetter}: ${sub}`;

          subQuestions.forEach((q: any, idx: number) => {
            q.question_number = questionIndex++;
            if (idx === 0) {
              q.sectionName = sectionTitle;
            }
            allQuestions.push(q);
          });
        }
      }

      // 5. Create PDF
      let pdfUrl = '';
      let keyPdfUrl = '';

      if (session.keyFormat === 'separate') {
        // 5a. Create printable PDF buffer WITHOUT answer key
        const pdfBuffer = await generateWorksheetPdf(
          subject,
          classLevel,
          board,
          chapterNames,
          session.difficulty,
          session.generationMode,
          allQuestions,
          false
        );
        pdfUrl = await uploadPdfBuffer(pdfBuffer, `${chapterNames[0] || 'Worksheet'}_${session.difficulty}`);

        // 5b. Create separate Answer Key PDF buffer
        const keyPdfBuffer = await generateAnswerKeyPdf(
          subject,
          classLevel,
          board,
          chapterNames,
          allQuestions
        );
        keyPdfUrl = await uploadPdfBuffer(keyPdfBuffer, `${chapterNames[0] || 'Worksheet'}_${session.difficulty}_AnswerKey`);
      } else {
        const includeKey = (session.keyFormat === 'embed');
        const pdfBuffer = await generateWorksheetPdf(
          subject,
          classLevel,
          board,
          chapterNames,
          session.difficulty,
          session.generationMode,
          allQuestions,
          includeKey
        );
        pdfUrl = await uploadPdfBuffer(pdfBuffer, `${chapterNames[0] || 'Worksheet'}_${session.difficulty}`);
      }

      const finalPdfUrl = keyPdfUrl ? `${pdfUrl}|${keyPdfUrl}` : pdfUrl;

      // 6. Cache in Database
      await supabase.from('generated_worksheets').insert({
        hash,
        chapter_ids: session.selectedChapterIds,
        difficulty: session.difficulty,
        question_count: session.questionCount,
        generation_mode: session.generationMode,
        prompt_version: PROMPT_VERSION,
        pdf_url: finalPdfUrl
      });

      await ctx.editMessageText('✅ <b>Worksheet generated! Sending file(s)...</b>', { parse_mode: 'HTML' });
      await ctx.replyWithDocument(
        { url: pdfUrl, filename: getWorksheetFilename(chapterNames, 'Worksheet') }
      );
      if (keyPdfUrl) {
        await ctx.replyWithDocument(
          { url: keyPdfUrl, filename: getWorksheetFilename(chapterNames, 'Answer_Key') }
        );
      }
    } catch (err: any) {
      console.error('Worksheet bot generation error:', err);
      await ctx.reply(`❌ Failed to generate worksheet: ${err.message || 'Service temporarily unavailable.'}`);
    }
  });

  // Action: go_start
  bot.action('go_start', async (ctx) => {
    try {
      await ctx.editMessageText(
        `📚 <b>Welcome to the Dicksy Tuition Centre Worksheet Generator!</b>\n\n` +
        `I am your AI learning assistant. I can fetch chapter summaries, formulas, important historical dates, and generate printable PDF worksheets tailored to your subjects.\n\n` +
        `Click below to start browsing our library:`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔍 Browse Classes', 'list_classes')],
            [Markup.button.callback('ℹ️ Help & FAQ', 'show_help')]
          ])
        }
      );
    } catch (err) {
      console.error('Go start error:', err);
    }
  });

  // Action: show_help
  bot.action('show_help', async (ctx) => {
    const helpText = 
      `ℹ️ <b>How to use the Worksheet Generator Bot:</b>\n\n` +
      `1. <b>Upload Chapters:</b> Navigate to the Tuition Centre Web Dashboard on your computer to upload textbook PDFs.\n` +
      `2. <b>Summaries:</b> Use the bot inline menus to read instant summaries, formula sheets, or historical timeline lists extracted from files.\n` +
      `3. <b>Generate Worksheets:</b> Select one or more chapters, configure target settings, and add custom instructions if desired. The bot will compile a printable worksheet with blank spaces for students and a teacher's answer sheet at the end!\n\n` +
      `If you have any issues, contact your tuition centre admin.`;

    await ctx.editMessageText(helpText, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Main Menu', 'go_start')]])
    });
  });

  // Text message handler for custom parameters
  bot.on('text', async (ctx) => {
    try {
      const session = getSession(ctx.from!.id);
      
      if (session.step === 'awaiting_count') {
        const val = parseInt(ctx.message.text.trim(), 10);
        if (isNaN(val) || val < 1 || val > 40) {
          return ctx.reply('⚠️ Please enter a valid number of questions (between 1 and 40):');
        }
        session.questionCount = val;
        session.step = 'idle';
        await ctx.reply('✅ Custom question count updated.');
        return showConfigMenu(ctx);
      }
      
      if (session.step === 'awaiting_notes') {
        const notes = ctx.message.text.trim();
        session.additionalNotes = notes;
        session.step = 'idle';
        await ctx.reply('✅ Custom notes updated.');
        return showConfigMenu(ctx);
      }
      
      // Default reply
      await ctx.replyWithHTML(
        `📚 <b>Welcome to the Dicksy Tuition Centre Worksheet Generator!</b>\n\n` +
        `I am your AI learning assistant. Choose from the menu below to start:`,
        Markup.inlineKeyboard([
          [Markup.button.callback('🔍 Browse Classes', 'list_classes')],
          [Markup.button.callback('ℹ️ Help & FAQ', 'show_help')]
        ])
      );
    } catch (err) {
      console.error('Text handler error:', err);
    }
  });

  // Start bot (Polling vs Webhook)
  if (process.env.WEBHOOK_URL && app) {
    const secretPath = `/telegraf/${bot.secretPathComponent()}`;
    app.use(bot.webhookCallback(secretPath));
    try {
      await bot.telegram.setWebhook(`${process.env.WEBHOOK_URL}${secretPath}`);
      console.log(`Telegram Bot successfully set up on Webhook: ${process.env.WEBHOOK_URL}${secretPath}`);
    } catch (err) {
      console.error('Failed to set Telegram Webhook:', err);
    }
  } else {
    // Start polling locally
    bot.launch();
    console.log('Telegram Bot successfully connected and listening (long-polling).');
  }

  // Enable graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

function getWorksheetFilename(chapterNames: string[], suffix: string): string {
  if (!chapterNames || chapterNames.length === 0) {
    return `Worksheet_${suffix}.pdf`;
  }
  
  let namePart = '';
  if (chapterNames.length === 1) {
    namePart = chapterNames[0];
  } else if (chapterNames.length === 2) {
    namePart = `${chapterNames[0]}_&_${chapterNames[1]}`;
  } else {
    namePart = `${chapterNames[0]}_&_${chapterNames.length - 1}_more`;
  }
  
  const cleanName = namePart
    .replace(/[^a-zA-Z0-9\s&_\-]/g, '')
    .replace(/[\s&]+/g, '_')
    .replace(/_+/g, '_');
    
  return `${cleanName}_${suffix}.pdf`;
}

/**
 * Utility to format summaries to HTML.
 */
function formatSummaryHtml(chapter: any): string {
  const s = chapter.summary;
  if (!s) return `No summary available for this chapter.`;

  let html = `📚 <b>Summary: ${chapter.chapter_name}</b>\n`;
  html += `<i>Subject: ${chapter.subject} | Class: ${chapter.class || 'N/A'} | Board: ${chapter.board}</i>\n\n`;

  if (s.topics && s.topics.length > 0) {
    html += `📌 <b>Topics:</b>\n`;
    s.topics.slice(0, 10).forEach((t: string) => { html += `• ${t}\n`; });
    html += `\n`;
  }

  if (s.important_terms && s.important_terms.length > 0) {
    html += `🔑 <b>Key Terms:</b>\n`;
    s.important_terms.slice(0, 10).forEach((t: string) => { html += `• ${t}\n`; });
    html += `\n`;
  }

  if (s.formulas && s.formulas.length > 0) {
    html += `📐 <b>Formulas:</b>\n`;
    s.formulas.slice(0, 10).forEach((f: string) => { html += `• <code>${f}</code>\n`; });
    html += `\n`;
  }

  if (s.dates && s.dates.length > 0) {
    html += `📅 <b>Dates:</b>\n`;
    s.dates.slice(0, 10).forEach((d: string) => { html += `• ${d}\n`; });
    html += `\n`;
  }

  if (s.events && s.events.length > 0) {
    html += `⚔️ <b>Events:</b>\n`;
    s.events.slice(0, 10).forEach((e: string) => { html += `• ${e}\n`; });
    html += `\n`;
  }

  if (s.people && s.people.length > 0) {
    html += `👤 <b>Key Figures:</b>\n`;
    s.people.slice(0, 10).forEach((p: string) => { html += `• ${p}\n`; });
    html += `\n`;
  }

  if (s.key_points && s.key_points.length > 0) {
    html += `💡 <b>Key Points:</b>\n`;
    s.key_points.slice(0, 10).forEach((p: string) => { html += `• ${p}\n`; });
    html += `\n`;
  }

  if (s.question_patterns && s.question_patterns.length > 0) {
    html += `❓ <b>Common Exam Questions:</b>\n`;
    s.question_patterns.slice(0, 5).forEach((p: string) => { html += `• ${p}\n`; });
  }

  return html;
}

async function renderBoardsList(ctx: any) {
  const session = getSession(ctx.from!.id);
  const query = supabase.from('chapters').select('board');
  
  if (session.activeClass === 'Other') {
    query.or('class.is.null,class.eq.N/A,class.eq.');
  } else {
    query.eq('class', session.activeClass);
  }

  const { data: chapters, error } = await query;
  if (error) throw error;

  if (!chapters || chapters.length === 0) {
    return ctx.editMessageText(`No education boards found under ${session.activeClass}.`, 
      Markup.inlineKeyboard([[Markup.button.callback('🔙 Back to Classes', 'list_classes')]])
    );
  }

  const boards = Array.from(new Set(chapters.map((c) => c.board || 'Other'))).sort();

  const keyboardButtons = boards.map((brd) => [
    Markup.button.callback(`📋 ${brd}`, `board:${brd}`)
  ]);
  keyboardButtons.push([Markup.button.callback('🔙 Back to Classes', 'list_classes')]);

  await ctx.editMessageText(`🎓 <b>Select a Board (${session.activeClass}):</b>`, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(keyboardButtons)
  });
}

async function renderSubjectsList(ctx: any) {
  const session = getSession(ctx.from!.id);
  const query = supabase.from('chapters').select('subject');

  if (session.activeClass === 'Other') {
    query.or('class.is.null,class.eq.N/A,class.eq.');
  } else {
    query.eq('class', session.activeClass);
  }

  if (session.activeBoard === 'Other') {
    query.or('board.is.null,board.eq.N/A,board.eq.');
  } else {
    query.eq('board', session.activeBoard);
  }

  const { data: chapters, error } = await query;
  if (error) throw error;

  if (!chapters || chapters.length === 0) {
    return ctx.editMessageText(`No subjects found for class ${session.activeClass} and board ${session.activeBoard}.`, 
      Markup.inlineKeyboard([[Markup.button.callback('🔙 Back to Boards', 'list_boards_menu')]])
    );
  }

  const subjects = Array.from(new Set(chapters.map((c) => c.subject))).sort();

  const keyboardButtons = subjects.map((subj) => [
    Markup.button.callback(`📖 ${subj}`, `subject:${subj}`)
  ]);
  keyboardButtons.push([Markup.button.callback('🔙 Back to Boards', 'list_boards_menu')]);

  await ctx.editMessageText(`🎓 <b>Select a Subject (${session.activeClass} | ${session.activeBoard}):</b>`, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(keyboardButtons)
  });
}

async function renderChaptersList(ctx: any) {
  const session = getSession(ctx.from!.id);
  const query = supabase
    .from('chapters')
    .select('id, chapter_name, board, class')
    .ilike('subject', session.activeSubject);
    
  if (session.activeClass === 'Other') {
    query.or('class.is.null,class.eq.N/A,class.eq.');
  } else {
    query.eq('class', session.activeClass);
  }

  if (session.activeBoard === 'Other') {
    query.or('board.is.null,board.eq.N/A,board.eq.');
  } else {
    query.eq('board', session.activeBoard);
  }
  
  const { data: chapters, error } = await query;
  if (error) throw error;

  if (!chapters || chapters.length === 0) {
    return ctx.editMessageText(`No chapters found under ${session.activeSubject} for ${session.activeClass} (${session.activeBoard}).`, 
      Markup.inlineKeyboard([[Markup.button.callback('🔙 Back to Subjects', 'list_subjects_menu')]])
    );
  }

  const keyboardButtons: any[] = [];
  
  chapters.forEach((ch) => {
    const isSelected = session.selectedChapterIds.includes(ch.id);
    const checkbox = isSelected ? '✅' : '⬜';
    
    keyboardButtons.push([
      Markup.button.callback(`${checkbox} ${ch.chapter_name}`, `toggle_chap:${ch.id}`),
      Markup.button.callback('📄 Notes', `view_sum:${ch.id}`)
    ]);
  });
  
  if (session.selectedChapterIds.length > 0) {
    keyboardButtons.push([
      Markup.button.callback(`🎯 Proceed to Settings (${session.selectedChapterIds.length} selected)`, 'go_configure')
    ]);
    keyboardButtons.push([
      Markup.button.callback('🧹 Clear Selection', 'clear_selection')
    ]);
  }
  
  keyboardButtons.push([Markup.button.callback('🔙 Back to Subjects', 'list_subjects_menu')]);

  const text = `📚 <b>Chapters in ${session.activeSubject} (${session.activeClass} | ${session.activeBoard}):</b>\n` +
    `• Click chapter checkbox to select/deselect.\n` +
    `• Click "Notes" to view summaries.\n` +
    `• Click "Proceed" when ready.`;

  try {
    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(keyboardButtons)
    });
  } catch {
    await ctx.replyWithHTML(text, Markup.inlineKeyboard(keyboardButtons));
  }
}

async function goConfigureHandler(ctx: any) {
  const session = getSession(ctx.from!.id);
  if (session.selectedChapterIds.length === 0) {
    return ctx.reply('⚠️ Please select at least one chapter first.');
  }

  const { data: chapters } = await supabase
    .from('chapters')
    .select('chapter_name, subject, class, board')
    .in('id', session.selectedChapterIds);

  const chapsListText = (chapters || [])
    .map(c => `• <b>${c.chapter_name}</b> (${c.subject})`)
    .join('\n');

  const configText = 
    `📝 <b>Configure Worksheet</b>\n\n` +
    `<b>Selected Chapters:</b>\n${chapsListText}\n\n` +
    `<b>Current Settings:</b>\n` +
    `• Difficulty: <b>${session.difficulty}</b>\n` +
    `• Question Count: <b>${session.questionCount}</b>\n` +
    `• Mode: <b>${session.generationMode}</b>\n` +
    `• Diagrams: <b>${session.includeDiagrams ? 'Yes' : 'No'}</b>\n` +
    `• Answer Key: <b>${session.keyFormat === 'embed' ? 'Embedded' : session.keyFormat === 'separate' ? 'Separate' : 'None'}</b>\n` +
    `• Custom Notes: <i>${session.additionalNotes || 'None'}</i>\n\n` +
    `Adjust parameters below before generating:`;

  try {
    await ctx.editMessageText(configText, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('📊 Difficulty', 'change_diff'),
          Markup.button.callback('🔢 Qs Count', 'change_count'),
        ],
        [
          Markup.button.callback('⚙️ Mode', 'change_mode'),
          Markup.button.callback('✍️ Edit Notes', 'change_notes'),
        ],
        [
          Markup.button.callback(session.includeDiagrams ? '🖼️ Diagrams: Yes' : '🖼️ Diagrams: No', 'toggle_diagrams'),
          Markup.button.callback('🔑 Answer Key', 'change_key_format'),
        ],
        [
          Markup.button.callback('➕ Add More Chapters', 'list_classes'),
        ],
        [
          Markup.button.callback('🚀 GENERATE WORKSHEET PDF', 'trigger_generation_flow'),
        ],
        [
          Markup.button.callback('🧹 Cancel & Restart', 'restart_session')
        ]
      ])
    });
  } catch {
    await ctx.replyWithHTML(configText, Markup.inlineKeyboard([
      [
        Markup.button.callback('📊 Difficulty', 'change_diff'),
        Markup.button.callback('🔢 Qs Count', 'change_count'),
      ],
      [
        Markup.button.callback('⚙️ Mode', 'change_mode'),
        Markup.button.callback('✍️ Edit Notes', 'change_notes'),
      ],
      [
        Markup.button.callback(session.includeDiagrams ? '🖼️ Diagrams: Yes' : '🖼️ Diagrams: No', 'toggle_diagrams'),
        Markup.button.callback('🔑 Answer Key', 'change_key_format'),
      ],
      [
        Markup.button.callback('➕ Add More Chapters', 'list_classes'),
      ],
      [
        Markup.button.callback('🚀 GENERATE WORKSHEET PDF', 'trigger_generation_flow'),
      ],
      [
        Markup.button.callback('🧹 Cancel & Restart', 'restart_session')
      ]
    ]));
  }
}

async function showConfigMenu(ctx: any) {
  await goConfigureHandler(ctx);
}
