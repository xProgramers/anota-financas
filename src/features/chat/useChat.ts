import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import type { ChatMessage, DraftStatus, Transaction } from '../../types/db';
import type { TransactionInput } from '../transactions/api';

const PAGE = 40;

export interface LocalMessage extends ChatMessage {
  /** mensagem otimista ainda não confirmada pelo servidor */
  local?: 'sending' | 'failed';
}

interface InterpretResponse {
  messages: ChatMessage[];
  updated: Array<{ id: string; draft_status: DraftStatus }>;
  transaction: Transaction | null;
  error?: string;
}

export function useChat(userId: string) {
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [sending, setSending] = useState(false);
  const loadingOlder = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(PAGE);
    if (error) setLoadError(errorMessage(error));
    else {
      setMessages(((data ?? []) as ChatMessage[]).reverse());
      setHasMore((data ?? []).length === PAGE);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadOlder = useCallback(async () => {
    const oldest = messages.find((m) => !m.local);
    if (!oldest || loadingOlder.current) return;
    loadingOlder.current = true;
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('user_id', userId)
      .lt('created_at', oldest.created_at)
      .order('created_at', { ascending: false })
      .limit(PAGE);
    loadingOlder.current = false;
    if (error) return toast.error(errorMessage(error));
    setMessages((prev) => [...((data ?? []) as ChatMessage[]).reverse(), ...prev]);
    setHasMore((data ?? []).length === PAGE);
  }, [messages, userId]);

  const send = useCallback(
    async (text: string, retryId?: string) => {
      const tempId = retryId ?? `local-${crypto.randomUUID()}`;
      const optimistic: LocalMessage = {
        id: tempId,
        user_id: userId,
        role: 'user',
        content: text,
        transaction_id: null,
        draft: null,
        draft_status: null,
        created_at: new Date().toISOString(),
        local: 'sending',
      };
      setMessages((prev) => (retryId ? prev.map((m) => (m.id === retryId ? optimistic : m)) : [...prev, optimistic]));
      setSending(true);

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) throw new Error('Sua sessão expirou. Entre novamente.');

        const res = await fetch('/api/ai/interpret', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ message: text }),
        });
        const body = (await res.json().catch(() => ({}))) as Partial<InterpretResponse>;
        if (!res.ok || !body.messages) {
          if (res.status === 401) {
            toast.error(body.error ?? 'Sua sessão expirou. Entre novamente.');
            await supabase.auth.signOut();
          }
          throw new Error(body.error ?? 'Não consegui processar sua mensagem agora.');
        }

        const statusById = new Map(body.updated?.map((u) => [u.id, u.draft_status]));
        setMessages((prev) => [
          ...prev
            .filter((m) => m.id !== tempId)
            .map((m) => (statusById.has(m.id) ? { ...m, draft_status: statusById.get(m.id)! } : m)),
          ...body.messages!,
        ]);
        if (body.transaction) {
          toast.success(body.transaction.type === 'income' ? 'Receita registrada' : 'Despesa registrada');
        }
      } catch (err) {
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, local: 'failed' } : m)));
        toast.error(errorMessage(err));
      } finally {
        setSending(false);
      }
    },
    [userId],
  );

  const confirmDraft = useCallback(async (message: ChatMessage, values: TransactionInput) => {
    const { data, error } = await supabase.rpc('confirm_draft', {
      p_message_id: message.id,
      p_type: values.type,
      p_amount: values.amount,
      p_category_id: values.category_id,
      p_description: values.description,
      p_date: values.transaction_date,
    });
    if (error) throw new Error(/já foi processado/.test(error.message) ? 'Este registro já foi processado.' : errorMessage(error));
    const tx = data as Transaction;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === message.id
          ? {
              ...m,
              draft_status: 'confirmed',
              transaction_id: tx.id,
              draft: m.draft && {
                ...m.draft,
                transaction_type: tx.type,
                amount: Number(tx.amount),
                category_id: tx.category_id,
                description: tx.description,
                date: tx.transaction_date,
                clarification_question: null,
              },
            }
          : m,
      ),
    );
    toast.success(tx.type === 'income' ? 'Receita registrada ✓' : 'Despesa registrada ✓');
  }, []);

  const discardDraft = useCallback(async (message: ChatMessage) => {
    const { error } = await supabase
      .from('chat_messages')
      .update({ draft_status: 'discarded' })
      .eq('id', message.id)
      .eq('draft_status', 'pending');
    if (error) return toast.error(errorMessage(error));
    setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, draft_status: 'discarded' } : m)));
  }, []);

  return { messages, loading, loadError, hasMore, sending, load, loadOlder, send, confirmDraft, discardDraft };
}
