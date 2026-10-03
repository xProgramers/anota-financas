import { supabase } from '../../lib/supabase';
import type { Transaction, TxType } from '../../types/db';

export interface TransactionInput {
  type: TxType;
  amount: number;
  category_id: string | null;
  description: string;
  transaction_date: string;
}

export interface TransactionFilters {
  search?: string;
  categoryId?: string;
  type?: TxType | '';
  start?: string;
  end?: string;
  order?: 'desc' | 'asc';
}

export const PAGE_SIZE = 30;

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function listTransactions(userId: string, filters: TransactionFilters, page: number) {
  let q = supabase
    .from('transactions')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('transaction_date', { ascending: filters.order === 'asc' })
    .order('created_at', { ascending: filters.order === 'asc' })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

  if (filters.search?.trim()) q = q.ilike('description', `%${escapeLike(filters.search.trim().slice(0, 60))}%`);
  if (filters.categoryId) q = q.eq('category_id', filters.categoryId);
  if (filters.type) q = q.eq('type', filters.type);
  if (filters.start) q = q.gte('transaction_date', filters.start);
  if (filters.end) q = q.lte('transaction_date', filters.end);

  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: (data ?? []) as Transaction[], count: count ?? 0 };
}

export async function createTransaction(userId: string, input: TransactionInput, currency: string) {
  const { data, error } = await supabase
    .from('transactions')
    .insert({ ...input, user_id: userId, currency, source: 'manual' })
    .select()
    .single();
  if (error) throw error;
  return data as Transaction;
}

export async function updateTransaction(id: string, input: TransactionInput) {
  const { data, error } = await supabase.from('transactions').update(input).eq('id', id).select().single();
  if (error) throw error;
  return data as Transaction;
}

export async function deleteTransaction(id: string) {
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) throw error;
}
