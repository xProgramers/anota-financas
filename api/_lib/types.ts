// Tipos compartilhados pela camada de IA (sem dependências externas).

export type TxType = 'expense' | 'income';

export interface CategoryRef {
  id: string;
  name: string;
  type: TxType;
}

/** Rascunho de transação proposto ao usuário (salvo em chat_messages.draft). */
export interface Draft {
  transaction_type: TxType;
  amount: number | null;
  category_id: string | null;
  category_name: string | null;
  description: string | null;
  date: string; // YYYY-MM-DD
  confidence: number;
  clarification_question: string | null;
}

export type Intent =
  | 'new_transaction'
  | 'update_pending'
  | 'confirm_pending'
  | 'cancel_pending'
  | 'query'
  | 'other';

export type QueryMetric = 'total' | 'count' | 'balance' | 'top_category';
export type QueryPeriod =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'last_7_days'
  | 'last_30_days'
  | 'custom';

export interface QuerySpec {
  metric: QueryMetric;
  transaction_type: TxType | null;
  period: QueryPeriod;
  start_date: string | null;
  end_date: string | null;
  category: string | null;
  search: string | null;
}

/**
 * Formato que o modelo (ou o interpretador local) devolve.
 * Segue o schema do documento do produto, com `intent` e `query` a mais
 * para suportar correções e perguntas.
 */
export interface Interpretation {
  intent: Intent;
  is_transaction: boolean;
  transaction_type: TxType | null;
  amount: number | null;
  currency: string | null;
  category: string | null;
  description: string | null;
  date: string | null;
  confidence: number;
  needs_confirmation: boolean;
  clarification_question: string | null;
  query: QuerySpec | null;
  reply: string | null;
  /** O que a pessoa disse, quando a mensagem veio por áudio. */
  transcript: string | null;
}

/** Foto de comprovante. Fica só na memória durante a requisição; nunca é salva. */
export interface ImageInput {
  data: string; // base64 sem prefixo data:
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
}

/** Áudio gravado no app (WAV mono). Como a foto, fica só na memória durante a requisição. */
export interface AudioInput {
  data: string; // base64 sem prefixo data:
  mimeType: 'audio/wav';
}

export type MediaInput = ImageInput | AudioInput;

export function isAudio(media: MediaInput): media is AudioInput {
  return media.mimeType.startsWith('audio/');
}

export interface InterpretContext {
  text: string;
  today: string; // YYYY-MM-DD no fuso do usuário
  weekday: number; // 0 = domingo
  categories: CategoryRef[];
  pending: Draft | null;
}

/** Consulta já resolvida em datas e ids, pronta para ir ao banco. */
export interface ResolvedQuery {
  metric: QueryMetric;
  transaction_type: TxType | null;
  start: string;
  end: string;
  category_id: string | null;
  category_name: string | null;
  search: string | null;
  label: string; // "este mês", "ontem", ...
}

export type EngineResult =
  | { kind: 'draft'; draft: Draft; replaces_pending: boolean }
  | { kind: 'confirm' }
  | { kind: 'cancel' }
  | { kind: 'query'; query: ResolvedQuery }
  | { kind: 'message'; text: string };
