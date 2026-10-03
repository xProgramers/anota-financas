import { ArrowUp } from 'lucide-react';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { ScanReceiptIcon } from '../../components/ScanReceiptIcon';

const MAX = 500;

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onPickPhoto: () => void;
  disabled: boolean;
}

export function ChatInput({ value, onChange, onSend, onPickPhoto, disabled }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // altura automática (até ~5 linhas)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [value]);

  useEffect(() => {
    if (!disabled && window.matchMedia('(pointer: fine)').matches) ref.current?.focus({ preventScroll: true });
  }, [disabled]);

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (value.trim() && !disabled) onSend();
    }
  }

  const near = value.length > MAX - 60;
  const canSend = Boolean(value.trim()) && !disabled;

  return (
    <div className="relative flex items-end gap-2 rounded-[26px] border border-line bg-surface p-1.5 shadow-[0_1px_2px_rgb(60_45_20/0.06),0_8px_24px_-12px_rgb(60_45_20/0.18)] transition focus-within:border-brand/60 focus-within:ring-4 focus-within:ring-brand/10">
      <button
        type="button"
        onClick={onPickPhoto}
        disabled={disabled}
        aria-label="Foto de nota ou cupom fiscal"
        title="Foto de nota ou cupom fiscal"
        className="flex h-11 shrink-0 items-center gap-2 rounded-[20px] bg-brand-soft pr-3.5 pl-3 text-brand transition hover:brightness-[0.97] active:scale-[0.97] disabled:opacity-40 max-sm:w-11 max-sm:justify-center max-sm:px-0"
      >
        <ScanReceiptIcon className="size-[22px]" />
        <span className="text-sm font-semibold max-sm:hidden">Cupom</span>
      </button>
      <label htmlFor="chat-input" className="sr-only">
        Mensagem
      </label>
      <textarea
        id="chat-input"
        ref={ref}
        rows={1}
        maxLength={MAX}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Anote um gasto, uma receita ou pergunte…"
        className="chat-field max-h-[140px] min-h-11 flex-1 resize-none bg-transparent px-1 py-[10px] text-base leading-6 text-ink outline-none placeholder:text-muted/70"
        autoComplete="off"
        enterKeyHint="send"
      />
      {near && <span className="absolute -top-6 right-4 text-xs text-muted">{MAX - value.length}</span>}
      <button
        type="button"
        onClick={onSend}
        disabled={!canSend}
        aria-label="Enviar"
        className={`flex size-11 shrink-0 items-center justify-center rounded-full transition active:scale-[0.95] ${
          canSend ? 'bg-brand text-brand-ink shadow-sm hover:brightness-110' : 'bg-line/70 text-muted'
        }`}
      >
        <ArrowUp className="size-5" strokeWidth={2.4} />
      </button>
    </div>
  );
}
