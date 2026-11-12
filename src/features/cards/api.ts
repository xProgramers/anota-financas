import { supabase } from '../../lib/supabase';
import type { CreditCard, Transaction } from '../../types/db';

export interface CardInput {
  name: string;
  closing_day: number;
  due_day: number;
  color: string;
}

export const CARD_COLORS = ['#7048e8', '#1c7ed6', '#0c8599', '#2f9e44', '#e8590c', '#c2255c', '#212529'];

export async function createCard(userId: string, input: CardInput) {
  const { data, error } = await supabase
    .from('credit_cards')
    .insert({ ...input, user_id: userId })
    .select()
    .single();
  if (error) throw friendly(error);
  return data as CreditCard;
}

export async function updateCard(id: string, input: CardInput) {
  const { data, error } = await supabase.from('credit_cards').update(input).eq('id', id).select().single();
  if (error) throw friendly(error);
  return data as CreditCard;
}

export async function deleteCard(id: string) {
  const { error } = await supabase.from('credit_cards').delete().eq('id', id);
  if (error) throw error;
}

/** Compras de um cartão entre duas datas (inclusive). */
export async function listCardPurchases(cardId: string, start: string, end: string) {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('card_id', cardId)
    .gte('transaction_date', start)
    .lte('transaction_date', end)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Transaction[];
}

/** Liga (ou desliga, com null) uma transação a um cartão. */
export async function setTransactionCard(transactionId: string, cardId: string | null) {
  const { error } = await supabase.from('transactions').update({ card_id: cardId }).eq('id', transactionId);
  if (error) throw error;
}

function friendly(error: { code?: string; message: string }) {
  if (error.code === '23505') return new Error('Você já tem um cartão com esse nome.');
  return error;
}
