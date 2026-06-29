export interface ParsedMetadata {
  class: string;
  subject: string;
  board: string;
  chapter_name: string;
}

/**
 * Parses file names like "10_maths_gb_trigonometry" or "9_history_ncert"
 * and extracts structured metadata.
 */
export function parseFilename(filename: string): ParsedMetadata {
  // Strip file path (if any) and file extension
  const baseName = filename.split('/').pop() || filename;
  const nameWithoutExt = baseName.replace(/\.[^/.]+$/, "");
  
  let workingName = nameWithoutExt.replace(/[_-]/g, ' ').trim();

  let parsedClass = 'General';
  let parsedSubject = 'General';
  let parsedBoard = 'NCERT';

  // 1. Detect Class / Grade
  // Match "class 9", "class9", "grade 10", "grade10", "gr 10", "cl 9", "9th", "10th"
  const classRegex = /\b(?:class|grade|gr|cl)\s*(\d+)\b|\b(\d+)(?:st|nd|rd|th)\b/i;
  const classMatch = workingName.match(classRegex);
  if (classMatch) {
    const num = classMatch[1] || classMatch[2];
    parsedClass = `Class ${num}`;
    workingName = workingName.replace(classMatch[0], '');
  } else {
    // Check if there is a standalone 9 or 10 or similar that could indicate class
    const standaloneNumberMatch = workingName.match(/\b(9|10|11|12|8|7|6)\b/);
    if (standaloneNumberMatch) {
      parsedClass = `Class ${standaloneNumberMatch[1]}`;
      workingName = workingName.replace(standaloneNumberMatch[0], '');
    }
  }

  // 2. Detect Board
  const boardRegex = /\b(cbse|icse|ncert|gb|goa\s*board|state\s*board|ib|igcse)\b/i;
  const boardMatch = workingName.match(boardRegex);
  if (boardMatch) {
    const rawBoard = boardMatch[1].toLowerCase();
    if (rawBoard === 'gb' || rawBoard.startsWith('goa')) {
      parsedBoard = 'Goa Board';
    } else if (rawBoard === 'cbse') {
      parsedBoard = 'CBSE';
    } else if (rawBoard === 'ncert') {
      parsedBoard = 'NCERT';
    } else if (rawBoard === 'icse') {
      parsedBoard = 'ICSE';
    } else {
      parsedBoard = boardMatch[1].toUpperCase();
    }
    workingName = workingName.replace(boardMatch[0], '');
  }

  // 3. Detect Subject
  const subjectRegex = /\b(social\s*studies|social\s*science|social\s*sci|social|math|maths|mathematics|sci|science|physics|phy|chemistry|chem|biology|bio|history|hist|geography|geo|civics|english|eng)\b/i;
  const subjectMatch = workingName.match(subjectRegex);
  if (subjectMatch) {
    parsedSubject = normalizeSubject(subjectMatch[1]);
    workingName = workingName.replace(subjectMatch[0], '');
  }

  // 4. Chapter Name is the remaining workingName, cleaned of extra spaces
  let parsedChapter = workingName
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

  // Fallbacks if empty
  if (!parsedChapter) {
    parsedChapter = `${parsedSubject} Chapter`;
  }

  return {
    class: parsedClass,
    subject: parsedSubject,
    board: parsedBoard,
    chapter_name: parsedChapter,
  };
}

/**
 * Normalizes subject names to a standard list.
 */
export function normalizeSubject(subject: string): string {
  const rawSubj = subject.trim().toLowerCase().replace(/\s+/g, ' ');
  if (rawSubj === 'math' || rawSubj === 'maths' || rawSubj === 'mathematics') {
    return 'Mathematics';
  } else if (rawSubj === 'sci' || rawSubj === 'science') {
    return 'Science';
  } else if (rawSubj === 'physics' || rawSubj === 'phy') {
    return 'Physics';
  } else if (rawSubj === 'chemistry' || rawSubj === 'chem') {
    return 'Chemistry';
  } else if (rawSubj === 'biology' || rawSubj === 'bio') {
    return 'Biology';
  } else if (
    rawSubj === 'history' || rawSubj === 'hist' ||
    rawSubj === 'geography' || rawSubj === 'geo' ||
    rawSubj === 'civics' ||
    rawSubj === 'social' || rawSubj === 'social science' || rawSubj === 'social studies' || rawSubj === 'social sci'
  ) {
    return 'Social Science';
  } else if (rawSubj === 'english' || rawSubj === 'eng') {
    return 'English';
  }
  // Fallback
  return subject.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

