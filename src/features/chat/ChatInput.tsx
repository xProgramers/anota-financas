import { ArrowUp, Camera } from 'lucide-react';
import { useEffect, useRef, type KeyboardEvent } from 'react';

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
    if (!disabled) ref.current?.focus({ preventScroll: true });
  }, [disabled]);

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (value.trim() && !disabled) onSend();
    }
  }

  const near = value.length > MAX - 60;

  return (
    <div className="relative flex items-end gap-1.5 rounded-2xl border border-line bg-surface p-2 shadow-sm focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15">
      <button
        type="button"
        onClick={onPickPhoto}
        disabled={disabled}
        aria-label="Enviar foto de nota ou cupom fiscal"
        title="Tirar ou escolher foto de nota/cupom fiscal"
        className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-brand-soft px-3 text-sm font-semibold text-brand transition hover:brightness-95 disabled:opacity-35"
      >
        <Camera className="size-5" aria-hidden />
        <span className="hidden sm:inline">Foto</span>
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
        placeholder="Digite um gasto, uma receita ou faça uma pergunta..."
        className="max-h-[140px] min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-base leading-6 outline-none placeholder:text-muted/80"
        autoComplete="off"
        enterKeyHint="send"
      />
      {near && <span className="absolute -top-6 right-3 text-xs text-muted">{MAX - value.length}</span>}
      <button
        type="button"
        onClick={onSend}
        disabled={disabled || !value.trim()}
        aria-label="Enviar"
        className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-ink transition hover:brightness-110 disabled:opacity-35"
      >
        <ArrowUp className="size-5" strokeWidth={2.4} />
      </button>
    </div>
  );
}
