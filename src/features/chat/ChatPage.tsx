import { AlertCircle, Camera, RotateCw } from 'lucide-react';
import { Fragment, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { Spinner } from '../../components/ui/States';
import { addDays, formatBRDate, timeOf, todayIn } from '../../lib/format';
import { prepareReceiptImage } from '../../lib/image';
import type { ChatMessage, Draft } from '../../types/db';
import { useAuth } from '../auth/AuthProvider';
import { TransactionModal } from '../transactions/TransactionModal';
import { ChatInput } from './ChatInput';
import { useChat, type LocalMessage } from './ChatProvider';
import { DraftCard } from './DraftCard';

const EXAMPLES = ['Gastei R$ 25 no almoço', 'Uber 18,50', 'Recebi meu salário de 4.500', 'Quanto gastei esse mês?'];

function dayKey(ts: string, tz: string) {
  return todayIn(tz, new Date(ts)).today;
}

function dayLabel(key: string, today: string) {
  if (key === today) return 'Hoje';
  if (key === addDays(today, -1)) return 'Ontem';
  return formatBRDate(key);
}

export function ChatPage() {
  const { profile } = useAuth();
  const location = useLocation();
  const tz = profile?.timezone ?? 'America/Sao_Paulo';
  const currency = profile?.currency ?? 'BRL';
  const { today } = todayIn(tz);
  const chat = useChat();
  const [text, setText] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [editing, setEditing] = useState<(ChatMessage & { draft: Draft }) | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pickPhoto = () => fileRef.current?.click();
  const firstRender = useRef(true);

  const latestPendingId = useMemo(
    () => [...chat.messages].reverse().find((m) => m.draft_status === 'pending')?.id,
    [chat.messages],
  );

  // Sempre acompanha o fim da conversa.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: firstRender.current ? 'auto' : 'smooth' });
    firstRender.current = false;
  }, [chat.messages, chat.sending]);

  const busy = Boolean(chat.sending) || preparing || !chat.ready;

  function submit(value = text) {
    const v = value.trim();
    if (!v || busy) return;
    setText('');
    void chat.send(v);
  }

  async function sendPhoto(file: File) {
    if (busy) return;
    setPreparing(true);
    try {
      const image = await prepareReceiptImage(file);
      const caption = text.trim();
      setText('');
      void chat.send(caption, image);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não consegui usar essa foto.');
    } finally {
      setPreparing(false);
    }
  }

  const welcome = Boolean((location.state as { welcome?: boolean } | null)?.welcome);
  const firstName = profile?.name?.split(' ')[0];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
        <div className="mx-auto flex w-full max-w-2xl flex-col px-4 pt-6 pb-4 md:px-6">
          {!chat.ready && <Spinner label="Preparando…" />}

          {chat.ready && chat.messages.length === 0 && (
            <div className="flex flex-col pt-[12vh] pb-8">
              <h1 className="max-w-md text-[26px] leading-snug font-semibold tracking-tight">
                {welcome || !firstName ? 'Vamos começar.' : `Oi, ${firstName}.`} Você pode escrever seus gastos normalmente.
              </h1>
              <p className="mt-3 text-[15px] text-muted">
                Eu entendo o valor, a categoria e a data. Você só confirma. Também dá para mandar a foto de uma nota ou cupom fiscal.
              </p>
              <div className="mt-8 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={pickPhoto}
                  className="inline-flex items-center gap-2 rounded-full bg-brand px-3.5 py-2 text-sm font-medium text-brand-ink transition hover:brightness-110"
                >
                  <Camera className="size-4" aria-hidden />
                  Foto de nota ou cupom
                </button>
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => submit(ex)}
                    className="rounded-full border border-line bg-surface px-3.5 py-2 text-sm text-ink transition hover:border-brand hover:text-brand"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {chat.messages.map((m, i) => {
            const prev = chat.messages[i - 1];
            const key = dayKey(m.created_at, tz);
            const newDay = !prev || dayKey(prev.created_at, tz) !== key;
            const gap = !prev || newDay || prev.role !== m.role || Date.parse(m.created_at) - Date.parse(prev.created_at) > 5 * 60_000;
            return (
              <Fragment key={m.id}>
                {newDay && (
                  <div className="my-5 flex items-center gap-3 text-xs text-muted" role="separator">
                    <span className="h-px flex-1 bg-line" />
                    {dayLabel(key, today)}
                    <span className="h-px flex-1 bg-line" />
                  </div>
                )}
                <MessageRow
                  message={m}
                  showTime={gap}
                  today={today}
                  currency={currency}
                  isLatestPending={m.id === latestPendingId}
                  onRetry={() => void chat.send(m.content.replace(/^📷 Foto de comprovante:? ?/, ''), m.retryImage, m.id)}
                  onConfirm={async (msg) => {
                    const d = msg.draft;
                    await chat.confirmDraft(msg, {
                      type: d.transaction_type,
                      amount: d.amount!,
                      category_id: d.category_id,
                      description: d.description ?? '',
                      transaction_date: d.date,
                    });
                  }}
                  onEdit={setEditing}
                  onDiscard={(msg) => void chat.discardDraft(msg)}
                />
              </Fragment>
            );
          })}

          {(chat.sending || preparing) && (
            <div className="mt-3 flex items-center gap-2 text-sm text-muted" role="status">
              <span className="typing inline-flex gap-0.5 text-lg leading-none text-brand" aria-hidden>
                <span>•</span>
                <span>•</span>
                <span>•</span>
              </span>
              {preparing ? 'Preparando a foto…' : chat.sending === 'photo' ? 'Lendo o comprovante…' : 'Analisando sua anotação…'}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 bg-gradient-to-t from-paper via-paper to-paper/0 pt-2 pb-[max(12px,env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-2xl px-3 md:px-6">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = ''; // permite escolher a mesma foto de novo
              if (file) void sendPhoto(file);
            }}
          />
          <ChatInput value={text} onChange={setText} onSend={() => submit()} onPickPhoto={pickPhoto} disabled={busy} />
          <p className="mt-2 hidden text-center text-xs text-muted md:block">
            Enter envia, Shift + Enter quebra a linha. Fotos não são guardadas.
          </p>
        </div>
      </div>

      {editing && (
        <TransactionModal
          open
          title="Revisar antes de salvar"
          submitLabel="Confirmar"
          initial={{
            type: editing.draft.transaction_type,
            amount: editing.draft.amount,
            category_id: editing.draft.category_id,
            description: editing.draft.description ?? '',
            transaction_date: editing.draft.date,
          }}
          onClose={() => setEditing(null)}
          onSubmit={async (values) => {
            await chat.confirmDraft(editing, values);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

interface RowProps {
  message: LocalMessage;
  showTime: boolean;
  today: string;
  currency: string;
  isLatestPending: boolean;
  onRetry: () => void;
  onConfirm: (m: ChatMessage & { draft: Draft }) => Promise<void>;
  onEdit: (m: ChatMessage & { draft: Draft }) => void;
  onDiscard: (m: ChatMessage & { draft: Draft }) => void;
}

function MessageRow({ message: m, showTime, today, currency, isLatestPending, onRetry, onConfirm, onEdit, onDiscard }: RowProps) {
  const time = showTime && !m.local ? <span className="mb-1 text-[11px] text-muted">{timeOf(m.created_at)}</span> : null;

  if (m.role === 'user') {
    return (
      <div className={`flex flex-col items-end ${showTime ? 'mt-4' : 'mt-1.5'}`}>
        {time}
        {m.photoUrl && (
          <img
            src={m.photoUrl}
            alt="Foto do comprovante enviada"
            className={`mb-1.5 max-h-56 max-w-[60%] rounded-xl border border-line object-cover ${m.local === 'sending' ? 'opacity-70' : ''}`}
          />
        )}
        <div
          className={`max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-paper ${
            m.local === 'sending' ? 'opacity-70' : ''
          }`}
        >
          {m.content}
        </div>
        {m.photoDiscarded && <span className="mt-1 text-[11px] text-muted">Foto descartada</span>}
        {m.local === 'failed' && (
          <button type="button" onClick={onRetry} className="mt-1 flex items-center gap-1 text-xs font-medium text-danger">
            <AlertCircle className="size-3.5" /> Não enviada. <RotateCw className="size-3" /> Tentar de novo
          </button>
        )}
      </div>
    );
  }

  const draftMessage = m.draft ? (m as ChatMessage & { draft: Draft }) : null;
  const question = draftMessage?.draft.clarification_question;

  return (
    <div className={`flex flex-col items-start ${showTime ? 'mt-4' : 'mt-1.5'}`}>
      {time}
      {draftMessage ? (
        <>
          <p className="mb-2 max-w-[85%] text-[15px] leading-relaxed">
            {question && m.draft_status === 'pending' ? question : m.draft_status === 'pending' ? 'Entendi assim. Está certo?' : 'Anotação'}
          </p>
          <DraftCard
            message={draftMessage}
            today={today}
            currency={currency}
            isLatestPending={isLatestPending}
            onConfirm={() => onConfirm(draftMessage)}
            onEdit={() => onEdit(draftMessage)}
            onDiscard={() => onDiscard(draftMessage)}
          />
        </>
      ) : (
        <p className="max-w-[85%] text-[15px] leading-relaxed whitespace-pre-wrap">{m.content}</p>
      )}
    </div>
  );
}
