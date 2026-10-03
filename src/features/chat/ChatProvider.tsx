import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '../../lib/format';
import type { PreparedImage } from '../../lib/image';
import { supabase } from '../../lib/supabase';
import type { ChatMessage, DraftStatus, Transaction } from '../../types/db';
import { useAuth } from '../auth/AuthProvider';
import type { TransactionInput } from '../transactions/api';

export interface LocalMessage extends ChatMessage {
  /** mensagem otimista ainda não confirmada pelo servidor */
  local?: 'sending' | 'failed';
  /** miniatura da foto, só na memória deste navegador */
  photoUrl?: string;
  /** a foto existiu, mas já foi descartada */
  photoDiscarded?: boolean;
  /** guardada só para "Tentar de novo" se o envio falhar */
  retryImage?: PreparedImage;
}

interface InterpretResponse {
  messages: ChatMessage[];
  updated: Array<{ id: string; draft_status: DraftStatus }>;
  transaction: Transaction | null;
  error?: string;
}

interface ChatState {
  messages: LocalMessage[];
  ready: boolean;
  sending: 'text' | 'photo' | null;
  send: (text: string, image?: PreparedImage, retryId?: string) => Promise<void>;
  confirmDraft: (message: ChatMessage, values: TransactionInput) => Promise<void>;
  discardDraft: (message: ChatMessage) => Promise<void>;
}

const ChatContext = createContext<ChatState | null>(null);

/**
 * Estado do chat. Vive enquanto a página estiver aberta (sobrevive à troca de abas
 * do app) e recomeça vazio a cada recarregamento.
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session!.user.id;
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [ready, setReady] = useState(false);
  const [sending, setSending] = useState<'text' | 'photo' | null>(null);
  const photoUrls = useRef(new Set<string>());

  // Nova página = conversa nova. Rascunhos que ficaram pendentes da sessão anterior
  // são descartados, para a IA não usar como contexto algo que a pessoa não vê.
  useEffect(() => {
    let active = true;
    supabase
      .from('chat_messages')
      .update({ draft_status: 'discarded' })
      .eq('user_id', userId)
      .eq('draft_status', 'pending')
      .then(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  // Libera as miniaturas da memória ao sair.
  useEffect(() => {
    const urls = photoUrls.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  /** Descarta as fotos: depois de confirmar ou cancelar, elas não existem mais em lugar nenhum. */
  const discardPhotos = useCallback(() => {
    photoUrls.current.forEach((u) => URL.revokeObjectURL(u));
    photoUrls.current.clear();
    setMessages((prev) =>
      prev.map((m) => (m.photoUrl || m.retryImage ? { ...m, photoUrl: undefined, retryImage: undefined, photoDiscarded: true } : m)),
    );
  }, []);

  const send = useCallback(
    async (text: string, image?: PreparedImage, retryId?: string) => {
      const tempId = retryId ?? `local-${crypto.randomUUID()}`;
      if (image) photoUrls.current.add(image.previewUrl);
      const optimistic: LocalMessage = {
        id: tempId,
        user_id: userId,
        role: 'user',
        content: image ? `📷 Foto de comprovante${text ? `: ${text}` : ''}` : text,
        transaction_id: null,
        draft: null,
        draft_status: null,
        created_at: new Date().toISOString(),
        local: 'sending',
        photoUrl: image?.previewUrl,
      };
      setMessages((prev) => (retryId ? prev.map((m) => (m.id === retryId ? optimistic : m)) : [...prev, optimistic]));
      setSending(image ? 'photo' : 'text');

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) throw new Error('Sua sessão expirou. Entre novamente.');

        const res = await fetch('/api/ai/interpret', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ message: text, image: image ? { data: image.data, mimeType: image.mimeType } : undefined }),
        });
        const body = (await res.json().catch(() => ({}))) as Partial<InterpretResponse>;
        if (!res.ok || !body.messages) {
          if (res.status === 401) {
            toast.error(body.error ?? 'Sua sessão expirou. Entre novamente.');
            await supabase.auth.signOut();
          }
          throw new Error(body.error ?? 'Não consegui processar sua mensagem agora.');
        }

        const [userMsg, assistant] = body.messages;
        const statusById = new Map(body.updated?.map((u) => [u.id, u.draft_status]));
        setMessages((prev) => [
          ...prev
            .filter((m) => m.id !== tempId)
            .map((m) => (statusById.has(m.id) ? { ...m, draft_status: statusById.get(m.id)! } : m)),
          { ...userMsg, photoUrl: image?.previewUrl },
          assistant,
        ]);

        const statuses = [...statusById.values()];
        const closed = statuses.includes('confirmed') || (statuses.includes('discarded') && !assistant?.draft);
        // Foto que não virou rascunho (ilegível, não é cupom) é descartada na hora.
        if (closed || (image && !assistant?.draft)) discardPhotos();
        if (body.transaction) {
          toast.success(body.transaction.type === 'income' ? 'Receita registrada' : 'Despesa registrada');
        }
      } catch (err) {
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, local: 'failed', retryImage: image } : m)));
        toast.error(errorMessage(err));
      } finally {
        setSending(null);
      }
    },
    [userId, discardPhotos],
  );

  const confirmDraft = useCallback(
    async (message: ChatMessage, values: TransactionInput) => {
      const { data, error } = await supabase.rpc('confirm_draft', {
        p_message_id: message.id,
        p_type: values.type,
        p_amount: values.amount,
        p_category_id: values.category_id,
        p_description: values.description,
        p_date: values.transaction_date,
      });
      if (error) {
        const msg = /já foi processado/.test(error.message) ? 'Este registro já foi processado.' : errorMessage(error);
        toast.error(msg);
        throw new Error(msg);
      }
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
      discardPhotos();
      toast.success(tx.type === 'income' ? 'Receita registrada ✓' : 'Despesa registrada ✓');
    },
    [discardPhotos],
  );

  const discardDraft = useCallback(
    async (message: ChatMessage) => {
      const { error } = await supabase
        .from('chat_messages')
        .update({ draft_status: 'discarded' })
        .eq('id', message.id)
        .eq('draft_status', 'pending');
      if (error) {
        toast.error(errorMessage(error));
        return;
      }
      setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, draft_status: 'discarded' } : m)));
      discardPhotos();
    },
    [discardPhotos],
  );

  return (
    <ChatContext.Provider value={{ messages, ready, sending, send, confirmDraft, discardDraft }}>{children}</ChatContext.Provider>
  );
}

export function useChat(): ChatState {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat precisa estar dentro de <ChatProvider>');
  return ctx;
}
