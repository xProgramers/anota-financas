import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '../../lib/format';
import type { PreparedAudio } from '../../lib/audio';
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
  /** o áudio existiu, mas já foi descartado */
  audioDiscarded?: boolean;
  /** guardado só para "Tentar de novo" se o envio falhar */
  retryAudio?: PreparedAudio;
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
  sending: 'text' | 'photo' | 'audio' | null;
  send: (text: string, media?: { image?: PreparedImage; audio?: PreparedAudio }, retryId?: string) => Promise<void>;
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
  const [sending, setSending] = useState<'text' | 'photo' | 'audio' | null>(null);
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

  /** Descarta fotos e áudios: depois de confirmar ou cancelar, eles não existem mais em lugar nenhum. */
  const discardMedia = useCallback(() => {
    photoUrls.current.forEach((u) => URL.revokeObjectURL(u));
    photoUrls.current.clear();
    setMessages((prev) =>
      prev.map((m) => {
        if (m.photoUrl || m.retryImage) m = { ...m, photoUrl: undefined, retryImage: undefined, photoDiscarded: true };
        if (m.retryAudio || m.content.startsWith('🎤')) m = { ...m, retryAudio: undefined, audioDiscarded: true };
        return m;
      }),
    );
  }, []);

  const send = useCallback(
    async (text: string, media: { image?: PreparedImage; audio?: PreparedAudio } = {}, retryId?: string) => {
      const { image, audio } = media;
      const tempId = retryId ?? `local-${crypto.randomUUID()}`;
      if (image) photoUrls.current.add(image.previewUrl);
      const optimistic: LocalMessage = {
        id: tempId,
        user_id: userId,
        role: 'user',
        content: audio ? '🎤 Áudio' : image ? `📷 Foto de comprovante${text ? `: ${text}` : ''}` : text,
        transaction_id: null,
        draft: null,
        draft_status: null,
        created_at: new Date().toISOString(),
        local: 'sending',
        photoUrl: image?.previewUrl,
      };
      setMessages((prev) => (retryId ? prev.map((m) => (m.id === retryId ? optimistic : m)) : [...prev, optimistic]));
      setSending(audio ? 'audio' : image ? 'photo' : 'text');

      try {
        const payload = JSON.stringify({
          message: text,
          image: image ? { data: image.data, mimeType: image.mimeType } : undefined,
          audio: audio ? { data: audio.data, mimeType: audio.mimeType } : undefined,
        });
        const call = (token: string) =>
          fetch('/api/ai/interpret', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: payload,
          });

        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) throw new Error('Sua sessão expirou. Entre novamente.');

        let res = await call(token);
        // Token vencido (aba parada por muito tempo): renova a sessão e tenta mais uma vez.
        if (res.status === 401) {
          const { data: refreshed } = await supabase.auth.refreshSession();
          if (refreshed.session) res = await call(refreshed.session.access_token);
        }
        const body = (await res.json().catch(() => ({}))) as Partial<InterpretResponse>;
        if (!res.ok || !body.messages) {
          if (res.status === 401) await supabase.auth.signOut();
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
        // Foto ou áudio que não virou rascunho (ilegível, não é um gasto) é descartado na hora.
        if (closed || ((image || audio) && !assistant?.draft)) discardMedia();
        if (body.transaction) {
          toast.success(body.transaction.type === 'income' ? 'Receita registrada' : 'Despesa registrada');
        }
      } catch (err) {
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, local: 'failed', retryImage: image, retryAudio: audio } : m)));
        toast.error(errorMessage(err));
      } finally {
        setSending(null);
      }
    },
    [userId, discardMedia],
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
      discardMedia();
      toast.success(tx.type === 'income' ? 'Receita registrada ✓' : 'Despesa registrada ✓');
    },
    [discardMedia],
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
      discardMedia();
    },
    [discardMedia],
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
