import type { Draft, TxType } from '../../api/_lib/types';

export type { Draft, TxType };

export interface Profile {
  id: string;
  user_id: string;
  name: string | null;
  avatar_url: string | null;
  currency: string;
  timezone: string;
  onboarded: boolean;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  type: TxType;
  icon: string;
  color: string;
  is_default: boolean;
  created_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  category_id: string | null;
  type: TxType;
  amount: number;
  currency: string;
  description: string;
  transaction_date: string;
  source: 'chat' | 'manual';
  created_at: string;
  updated_at: string;
}

export type DraftStatus = 'pending' | 'confirmed' | 'discarded';

export interface ChatMessage {
  id: string;
  user_id: string;
  role: 'user' | 'assistant';
  content: string;
  transaction_id: string | null;
  draft: Draft | null;
  draft_status: DraftStatus | null;
  created_at: string;
}

export interface Summary {
  expense_total: number;
  income_total: number;
  count: number;
  by_category: Array<{ category_id: string | null; name: string; color: string; icon: string; total: number; count: number }>;
  by_day: Array<{ day: string; expense: number | null; income: number | null }>;
}
