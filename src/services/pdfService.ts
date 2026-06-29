import PDFDocument from 'pdfkit';
import path from 'path';
import { GeneratedQuestionResponse } from './geminiService';

function registerCustomFonts(doc: PDFKit.PDFDocument) {
  const fontRegularPath = path.join(process.cwd(), 'fonts', 'DejaVuSans.ttf');
  const fontBoldPath = path.join(process.cwd(), 'fonts', 'DejaVuSans-Bold.ttf');
  doc.registerFont('DejaVuSans', fontRegularPath);
  doc.registerFont('DejaVuSans-Bold', fontBoldPath);
}

const reverseSuperscriptMap: { [key: string]: string } = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '-', '⁼': '=',
  'ᵃ': 'a', 'ᵇ': 'b', 'ᶜ': 'c', 'ᵈ': 'd', 'ᵉ': 'e',
  'ᶠ': 'f', 'ᵍ': 'g', 'ʰ': 'h', 'ⁱ': 'i', 'ʲ': 'j',
  'ᵏ': 'k', 'ˡ': 'l', 'ᵐ': 'm', 'ⁿ': 'n', 'ᵒ': 'o',
  'ᵖ': 'p', 'ʳ': 'r', 'ˢ': 's', 'ᵗ': 't', 'ᵘ': 'u',
  'ᵛ': 'v', 'ʷ': 'w', 'ˣ': 'x', 'ʸ': 'y', 'ᶻ': 'z',
  '⁄': '/'
};

function normalizeExponents(text: string): string {
  const uniSuperscriptRegex = /[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖʳˢᵗᵘᵛʷˣʸᶻ⁄]+/g;
  let normalized = text.replace(uniSuperscriptRegex, (match) => {
    const normalChars = match.split('').map(c => reverseSuperscriptMap[c] || c).join('');
    return `^{${normalChars}}`;
  });

  normalized = normalized.replace(/\^\(([^)]+)\)/g, '^{$1}');
  normalized = normalized.replace(/\^([0-9a-zA-Z+\-]+)/g, '^{$1}');
  return normalized;
}

function parseToRuns(text: string): { text: string; isSuperscript: boolean }[] {
  const runs: { text: string; isSuperscript: boolean }[] = [];
  const regex = /\^{([^}]+)}/g;
  let lastIndex = 0;
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push({
        text: text.substring(lastIndex, match.index),
        isSuperscript: false
      });
    }
    runs.push({
      text: match[1],
      isSuperscript: true
    });
    lastIndex = regex.lastIndex;
  }
  
  if (lastIndex < text.length) {
    runs.push({
      text: text.substring(lastIndex),
      isSuperscript: false
    });
  }
  
  return runs;
}

interface Token {
  text: string;
  isSuperscript: boolean;
  width: number;
  isBold: boolean;
}

function tokenizeRuns(
  runs: { text: string; isSuperscript: boolean }[],
  doc: PDFKit.PDFDocument,
  fontName: string,
  fontSize: number,
  superSize: number
): Token[] {
  const tokens: Token[] = [];
  let isFirst = true;
  for (const run of runs) {
    if (run.isSuperscript) {
      doc.font(fontName).fontSize(superSize);
      const width = doc.widthOfString(run.text);
      tokens.push({
        text: run.text,
        isSuperscript: true,
        width,
        isBold: false
      });
    } else {
      const parts = run.text.split(/(\s+)/g);
      for (const part of parts) {
        if (!part) continue;
        
        let isBold = false;
        let currentFont = fontName;
        if (isFirst && /^\d+\.$/.test(part)) {
          isBold = true;
          currentFont = fontName + '-Bold';
          isFirst = false;
        } else if (part.trim() !== '') {
          isFirst = false;
        }
        
        doc.font(currentFont).fontSize(fontSize);
        const width = doc.widthOfString(part);
        tokens.push({
          text: part,
          isSuperscript: false,
          width,
          isBold
        });
      }
    }
  }
  return tokens;
}

function wrapTokens(tokens: Token[], maxWidth: number): Token[][] {
  const lines: Token[][] = [];
  let currentLine: Token[] = [];
  let currentWidth = 0;
  
  for (const token of tokens) {
    if (token.text.trim() === '' && currentLine.length === 0) {
      continue;
    }
    
    if (currentWidth + token.width <= maxWidth) {
      currentLine.push(token);
      currentWidth += token.width;
    } else {
      if (token.text.trim() === '') {
        if (currentLine.length > 0) {
          lines.push(currentLine);
          currentLine = [];
          currentWidth = 0;
        }
      } else {
        if (currentLine.length > 0) {
          lines.push(currentLine);
          currentLine = [token];
          currentWidth = token.width;
        } else {
          currentLine.push(token);
          lines.push(currentLine);
          currentLine = [];
          currentWidth = 0;
        }
      }
    }
  }
  
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }
  
  return lines;
}

function drawMathText(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  fontName: string,
  fontSize: number,
  textColor: string
): number {
  const superSize = Math.round(fontSize * 0.65);
  const baselineShift = Math.round(fontSize * 0.35);
  
  doc.font(fontName).fontSize(fontSize);
  const lineHeight = doc.currentLineHeight() + 2;
  
  const paragraphs = text.split('\n');
  let currentY = y;
  
  for (const para of paragraphs) {
    const normalized = normalizeExponents(para);
    const runs = parseToRuns(normalized);
    const tokens = tokenizeRuns(runs, doc, fontName, fontSize, superSize);
    const lines = wrapTokens(tokens, maxWidth);
    
    for (const line of lines) {
      let currentX = x;
      for (const token of line) {
        const font = token.isBold ? fontName + '-Bold' : fontName;
        const size = token.isSuperscript ? superSize : fontSize;
        const color = token.isBold ? '#1e293b' : textColor;
        
        doc.font(font).fontSize(size).fillColor(color);
        
        if (token.isSuperscript) {
          doc.text(token.text, currentX, currentY - baselineShift, { lineBreak: false });
        } else {
          doc.text(token.text, currentX, currentY, { lineBreak: false });
        }
        currentX += token.width;
      }
      currentY += lineHeight;
    }
    
    if (lines.length === 0) {
      currentY += lineHeight;
    }
  }
  
  doc.y = currentY;
  return currentY - y;
}

function measureMathText(
  doc: PDFKit.PDFDocument,
  text: string,
  maxWidth: number,
  fontName: string,
  fontSize: number
): number {
  const superSize = Math.round(fontSize * 0.65);
  
  doc.font(fontName).fontSize(fontSize);
  const lineHeight = doc.currentLineHeight() + 2;
  
  const paragraphs = text.split('\n');
  let totalHeight = 0;
  
  for (const para of paragraphs) {
    const normalized = normalizeExponents(para);
    const runs = parseToRuns(normalized);
    const tokens = tokenizeRuns(runs, doc, fontName, fontSize, superSize);
    const lines = wrapTokens(tokens, maxWidth);
    
    if (lines.length === 0) {
      totalHeight += lineHeight;
    } else {
      totalHeight += lines.length * lineHeight;
    }
  }
  
  return totalHeight;
}

/**
 * Extracts SVG string blocks from the text, returning the text cleared of SVGs and the array of SVGs.
 */
function extractSvgs(text: string): { cleanedText: string; svgs: string[] } {
  const svgs: string[] = [];
  const svgRegexGlobal = /<svg[^>]*>([\s\S]*?)<\/svg>/gi;
  let match;
  svgRegexGlobal.lastIndex = 0;
  while ((match = svgRegexGlobal.exec(text)) !== null) {
    svgs.push(match[0]);
  }
  const cleanedText = text.replace(svgRegexGlobal, '').trim();
  return { cleanedText, svgs };
}

/**
 * Parses SVG width attribute, defaulting to 120.
 */
function parseSvgWidth(svgContent: string): number {
  const match = svgContent.match(/width\s*=\s*"([^"]*)"/i);
  return match ? parseFloat(match[1]) : 120;
}

/**
 * Parses SVG height attribute, defaulting to 120.
 */
function parseSvgHeight(svgContent: string): number {
  const match = svgContent.match(/height\s*=\s*"([^"]*)"/i);
  return match ? parseFloat(match[1]) : 120;
}

/**
 * Draws standard vector shapes from raw SVG XML code directly in the PDF document.
 * Translates coordinates automatically using doc.translate.
 */
function drawSimpleSvg(doc: PDFKit.PDFDocument, startX: number, startY: number, svgContent: string) {
  doc.save();
  doc.translate(startX, startY);

  const parseAttributes = (attrStr: string): Record<string, string> => {
    const attrs: Record<string, string> = {};
    const regex = /([a-z0-9\-]+)\s*=\s*"([^"]*)"/gi;
    let match;
    while ((match = regex.exec(attrStr)) !== null) {
      attrs[match[1].toLowerCase()] = match[2];
    }
    return attrs;
  };

  const applyStyles = (attrs: Record<string, string>) => {
    if (attrs.stroke && attrs.stroke !== 'none') {
      doc.strokeColor(attrs.stroke);
    } else {
      doc.strokeColor('#334155');
    }

    if (attrs['stroke-width']) {
      doc.lineWidth(parseFloat(attrs['stroke-width']));
    } else {
      doc.lineWidth(1);
    }

    if (attrs.fill && attrs.fill !== 'none') {
      doc.fillColor(attrs.fill);
      return true;
    }
    return false;
  };

  const drawAndPaint = (attrs: Record<string, string>, drawFn: () => void) => {
    doc.save();
    const hasFill = applyStyles(attrs);
    drawFn();

    const hasStroke = attrs.stroke !== 'none';
    if (hasFill && hasStroke) {
      doc.fillAndStroke();
    } else if (hasFill) {
      doc.fill();
    } else {
      doc.stroke();
    }
    doc.restore();
  };

  const elementRegex = /<(rect|circle|line|polygon|path|ellipse)\s+([^>]*)\/?>/gi;
  let match;
  elementRegex.lastIndex = 0;

  while ((match = elementRegex.exec(svgContent)) !== null) {
    const tagName = match[1].toLowerCase();
    const attrs = parseAttributes(match[2]);

    if (tagName === 'rect') {
      drawAndPaint(attrs, () => {
        const x = parseFloat(attrs.x || '0');
        const y = parseFloat(attrs.y || '0');
        const w = parseFloat(attrs.width || '0');
        const h = parseFloat(attrs.height || '0');
        doc.rect(x, y, w, h);
      });
    } else if (tagName === 'circle') {
      drawAndPaint(attrs, () => {
        const cx = parseFloat(attrs.cx || '0');
        const cy = parseFloat(attrs.cy || '0');
        const r = parseFloat(attrs.r || '0');
        doc.circle(cx, cy, r);
      });
    } else if (tagName === 'ellipse') {
      drawAndPaint(attrs, () => {
        const cx = parseFloat(attrs.cx || '0');
        const cy = parseFloat(attrs.cy || '0');
        const rx = parseFloat(attrs.rx || '0');
        const ry = parseFloat(attrs.ry || '0');
        doc.ellipse(cx, cy, rx, ry);
      });
    } else if (tagName === 'line') {
      drawAndPaint(attrs, () => {
        const x1 = parseFloat(attrs.x1 || '0');
        const y1 = parseFloat(attrs.y1 || '0');
        const x2 = parseFloat(attrs.x2 || '0');
        const y2 = parseFloat(attrs.y2 || '0');
        doc.moveTo(x1, y1).lineTo(x2, y2);
      });
    } else if (tagName === 'polygon') {
      drawAndPaint(attrs, () => {
        const pointsStr = attrs.points || '';
        const pts = pointsStr.trim().split(/\s+/).map(p => p.split(',').map(Number));
        doc.polygon(...pts);
      });
    } else if (tagName === 'path') {
      drawAndPaint(attrs, () => {
        const d = attrs.d || '';
        doc.path(d);
      });
    }
  }

  const textRegex = /<text\s+([^>]*)>([^<]*)<\/text>/gi;
  let textMatch;
  textRegex.lastIndex = 0;

  while ((textMatch = textRegex.exec(svgContent)) !== null) {
    const attrs = parseAttributes(textMatch[1]);
    const textContent = textMatch[2].trim();

    doc.save();
    if (attrs.fill && attrs.fill !== 'none') {
      doc.fillColor(attrs.fill);
    } else {
      doc.fillColor('#1e293b');
    }

    const x = parseFloat(attrs.x || '0');
    const y = parseFloat(attrs.y || '0');
    
    let fontSize = 9;
    if (attrs['font-size']) {
      fontSize = parseFloat(attrs['font-size']);
    }

    const isBold = attrs['font-weight'] === 'bold';
    const isItalic = attrs['font-style'] === 'italic';

    let fontName = 'DejaVuSans';
    if (isBold) fontName = 'DejaVuSans-Bold';

    doc.font(fontName).fontSize(fontSize);
    doc.text(textContent, x, y);
    doc.restore();
  }

  doc.restore();
}

/**
 * Generates a compact, professionally formatted PDF worksheet.
 * No empty response lines, small headers, and superscript equations. Supports multiple chapters.
 */
export function generateWorksheetPdf(
  subject: string,
  classLevel: string,
  board: string,
  chapterNames: string[],
  difficulty: string,
  mode: string,
  questions: GeneratedQuestionResponse[],
  includeAnswerKey: boolean = true
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 40, bottom: 40, left: 40, right: 40 },
        bufferPages: true,
      });

      registerCustomFonts(doc);

      const buffers: Buffer[] = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      // 1. Draw Compact Header
      drawHeader(doc, subject, classLevel, board, chapterNames, difficulty, mode, questions);

      // Move cursor to Y = 110 (after header)
      doc.y = 110;

      // 2. Draw Questions one after another (compactly in flow layout)
      questions.forEach((q) => {
        const rawQuestionText = q.question_text;
        const { cleanedText, svgs } = extractSvgs(rawQuestionText);
        
        const fullQuestionText = `${q.question_number}. ${cleanedText}   [${q.marks}m]`;
        const textHeight = measureMathText(doc, fullQuestionText, 515, 'DejaVuSans', 9) + 10;
        
        let svgsHeight = 0;
        svgs.forEach((svg) => {
          svgsHeight += parseSvgHeight(svg) + 15;
        });

        let sectionHeight = 0;
        if (q.sectionName) {
          sectionHeight = 32;
        }

        const totalHeight = textHeight + svgsHeight + sectionHeight + 12;

        // Check if it fits on the current page, if not start a new page
        const remainingSpace = doc.page.height - doc.y - doc.page.margins.bottom;
        if (totalHeight > remainingSpace) {
          doc.addPage();
        }

        // Draw Section Header if present
        if (q.sectionName) {
          doc.moveDown(0.5);
          const currentY = doc.y;
          doc.save();
          doc.fillColor('#f1f5f9'); // light grey background
          doc.rect(40, currentY, 515, 18).fill();
          
          doc.font('DejaVuSans-Bold').fontSize(8.5).fillColor('#1e3a8a');
          doc.text(q.sectionName.toUpperCase(), 48, currentY + 4);
          doc.restore();
          
          doc.y = currentY + 22; // advance Y below the banner
        }

        // Draw Question Text in flow layout using our custom math layout engine
        drawMathText(
          doc,
          fullQuestionText,
          40,
          doc.y,
          515,
          'DejaVuSans',
          9,
          '#334155'
        );

        // Render SVGs
        svgs.forEach((svg) => {
          doc.moveDown(0.5);
          const currentY = doc.y;
          const svgWidth = parseSvgWidth(svg);
          const svgHeight = parseSvgHeight(svg);
          const startX = 297.5 - svgWidth / 2; // Center horizontally in printable area
          drawSimpleSvg(doc, startX, currentY, svg);
          doc.y = currentY + svgHeight + 8;
        });

        doc.moveDown(0.8); // spacing below question
      });

      // 3. Draw Answer Key on separate page if requested
      if (includeAnswerKey) {
        doc.addPage();
        drawAnswerKey(doc, chapterNames, subject, classLevel, board, questions);
      }

      // Add page numbers
      const range = doc.bufferedPageRange();
      const oldBottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0; // Temporarily disable bottom margin to prevent auto-page creation on footer drawing
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        
        doc.save();
        doc.strokeColor('#e2e8f0');
        doc.lineWidth(0.5);
        doc.moveTo(40, 810).lineTo(555, 810).stroke();
        
        doc.font('DejaVuSans').fontSize(7.5).fillColor('#94a3b8');
        doc.text(
          `Page ${i + 1} of ${range.count}`,
          40,
          815,
          { align: 'right', width: 515 }
        );
        doc.text(
          `Dicksy Tuition Centre`,
          40,
          815,
          { align: 'left', width: 515 }
        );
        doc.restore();
      }
      doc.page.margins.bottom = oldBottomMargin; // Restore original bottom margin

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Generates only the Answer Key PDF.
 */
export function generateAnswerKeyPdf(
  subject: string,
  classLevel: string,
  board: string,
  chapterNames: string[],
  questions: GeneratedQuestionResponse[]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 40, bottom: 40, left: 40, right: 40 },
        bufferPages: true,
      });

      registerCustomFonts(doc);

      const buffers: Buffer[] = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      // Draw Answer Key directly on page 1
      drawAnswerKey(doc, chapterNames, subject, classLevel, board, questions);

      // Add page numbers
      const range = doc.bufferedPageRange();
      const oldBottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0; // Temporarily disable bottom margin to prevent auto-page creation on footer drawing
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        
        doc.save();
        doc.strokeColor('#e2e8f0');
        doc.lineWidth(0.5);
        doc.moveTo(40, 810).lineTo(555, 810).stroke();
        
        doc.font('DejaVuSans').fontSize(7.5).fillColor('#94a3b8');
        doc.text(
          `Page ${i + 1} of ${range.count}`,
          40,
          815,
          { align: 'right', width: 515 }
        );
        doc.text(
          `Dicksy Tuition Centre`,
          40,
          815,
          { align: 'left', width: 515 }
        );
        doc.restore();
      }
      doc.page.margins.bottom = oldBottomMargin; // Restore original bottom margin

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function drawHeader(
  doc: PDFKit.PDFDocument,
  subject: string,
  classLevel: string,
  board: string,
  chapterNames: string[],
  difficulty: string,
  mode: string,
  questions: GeneratedQuestionResponse[]
) {
  // Title & Brand (Left)
  doc.font('DejaVuSans-Bold').fontSize(11).fillColor('#1e3a8a');
  doc.text('Dicksy Tuition Centre', 40, 40, { width: 280 });

  // Student details lines (Right)
  doc.font('DejaVuSans').fontSize(7.5).fillColor('#475569');
  doc.text('Name: ______________________  Date: ________', 300, 40, { align: 'right', width: 255 });
  doc.text('Class: _______________  Score: ________', 300, 52, { align: 'right', width: 255 });

  // Divider
  doc.save();
  doc.strokeColor('#cbd5e1');
  doc.lineWidth(0.5);
  doc.moveTo(40, 66).lineTo(555, 66).stroke();
  doc.restore();
  // Chapter Name display (handles combined chapters)
  const maxChaptersToDisplay = 2;
  let chapterTitle = '';
  if (chapterNames.length > maxChaptersToDisplay) {
    chapterTitle = `${chapterNames.slice(0, maxChaptersToDisplay).join(', ')} + ${chapterNames.length - maxChaptersToDisplay} more`;
  } else {
    chapterTitle = chapterNames.join(' & ');
  }

  doc.font('DejaVuSans-Bold').fontSize(9.5).fillColor('#0f172a');
  doc.text(chapterTitle, 40, 72, { width: 515, ellipsis: true });

  // Metadata Row
  const totalMarks = questions.reduce((acc, q) => acc + q.marks, 0);
  
  doc.font('DejaVuSans').fontSize(7.5).fillColor('#475569');
  doc.text(`Max Marks: ${totalMarks}`, 40, 86);

  // Divider
  doc.save();
  doc.strokeColor('#cbd5e1');
  doc.lineWidth(0.5);
  doc.moveTo(40, 98).lineTo(555, 98).stroke();
  doc.restore();
}

function drawAnswerKey(
  doc: PDFKit.PDFDocument,
  chapterNames: string[],
  subject: string,
  classLevel: string,
  board: string,
  questions: GeneratedQuestionResponse[]
) {
  doc.font('DejaVuSans-Bold').fontSize(12).fillColor('#1e3a8a');
  doc.text('ANSWER KEY & DETAILED SOLUTIONS', 40, 40, { align: 'center', width: 515 });
  
  const keyTitle = chapterNames.length > 3
    ? `${chapterNames.slice(0, 3).join(', ')}...`
    : chapterNames.join(' & ');

  doc.font('DejaVuSans').fontSize(8.5).fillColor('#64748b');
  doc.text(`Chapters: ${keyTitle} (${subject} - ${classLevel} - ${board})`, 40, 55, { align: 'center', width: 515 });
  
  doc.font('DejaVuSans-Bold').fontSize(7.5).fillColor('#b91c1c');
  doc.text('[FOR TEACHER\'S USE ONLY — DO NOT DISTRIBUTE TO STUDENTS]', 40, 66, { align: 'center', width: 515 });

  doc.strokeColor('#e2e8f0');
  doc.lineWidth(0.5);
  doc.moveTo(40, 78).lineTo(555, 78).stroke();

  let currentY = 90;

  questions.forEach((q) => {
    const { cleanedText, svgs } = extractSvgs(q.solution);
    
    const textHeight = measureMathText(doc, cleanedText, 505, 'DejaVuSans', 8.5) + 15;
    
    let svgsHeight = 0;
    svgs.forEach((svg) => {
      svgsHeight += parseSvgHeight(svg) + 15;
    });
    
    let sectionHeight = 0;
    if (q.sectionName) {
      sectionHeight = 32;
    }

    const totalHeight = textHeight + svgsHeight + sectionHeight + 15;
    
    if (currentY + totalHeight > 760) {
      doc.addPage();
      currentY = 40;
    }

    if (q.sectionName) {
      doc.save();
      doc.fillColor('#f1f5f9');
      doc.rect(40, currentY, 515, 18).fill();
      
      doc.font('DejaVuSans-Bold').fontSize(8.5).fillColor('#1e3a8a');
      doc.text(q.sectionName.toUpperCase(), 48, currentY + 4);
      doc.restore();
      
      currentY += 25;
    }

    doc.font('DejaVuSans-Bold').fontSize(9).fillColor('#1e293b');
    doc.text(`Question ${q.question_number} [${q.marks}m]`, 40, currentY);
    currentY += 12;

    // Draw the solution using the custom math layout helper
    const solutionHeight = drawMathText(
      doc,
      cleanedText,
      50,
      currentY,
      505,
      'DejaVuSans',
      8.5,
      '#0f172a'
    );
    currentY += solutionHeight;

    svgs.forEach((svg) => {
      currentY += 6;
      const svgWidth = parseSvgWidth(svg);
      const svgHeight = parseSvgHeight(svg);
      const startX = 297.5 - svgWidth / 2;
      drawSimpleSvg(doc, startX, currentY, svg);
      currentY += svgHeight + 8;
    });

    currentY += 12; // spacing below solution
  });
}
