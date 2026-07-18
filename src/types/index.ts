export interface MathSummary {
  topics: string[];
  important_terms: string[];
  formulas: string[];
  examples: string[];
  question_patterns: string[];
}

export interface HistorySummary {
  topics: string[];
  important_terms: string[];
  dates: string[];
  events: string[];
  people: string[];
  question_patterns: string[];
}

export interface ITSummary {
  topics: string[];
  important_terms: string[];
  key_concepts: string[];
  code_or_commands: string[];
  question_patterns: string[];
}

export interface CommunicationsSummary {
  topics: string[];
  important_terms: string[];
  key_concepts: string[];
  writing_formats_or_examples: string[];
  question_patterns: string[];
}

export interface GeneralSummary {
  topics: string[];
  important_terms: string[];
  key_points: string[];
  question_patterns: string[];
}

export interface Chapter {
  id: string;
  telegram_user_id?: number | null;
  subject: string;
  class?: string | null;
  board: string;
  chapter_name: string;
  summary?: MathSummary | HistorySummary | GeneralSummary | ITSummary | CommunicationsSummary | null;
  created_at: string;
}

export interface Chunk {
  id: string;
  chapter_id: string;
  chunk_title?: string | null;
  chunk_content: string;
  chunk_order: number;
  chunk_type: 'theory' | 'example' | 'exercise' | 'facts' | string;
}

export interface GeneratedWorksheet {
  id: string;
  hash: string;
  chapter_id?: string | null;
  chapter_ids?: string[];
  difficulty: string;
  question_count: number;
  generation_mode: string;
  prompt_version: string;
  pdf_url: string;
  created_at: string;
}
