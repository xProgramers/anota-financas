import { Check, Pencil, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { formatMoney, friendlyDate } from '../../lib/format';
import type { ChatMessage, Draft } from '../../types/db';
import { useCategories } from '../categories/CategoriesProvider';
import { CategoryIcon } from '../categories/CategoryIcon';

interface Props {
  message: ChatMessage & { draft: Draft };
  today: string;
  currency: string;
  isLatestPending: boolean;
  onConfirm: () => Promise<void>;
  onEdit: () => void;
  onDiscard: () => void;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 text-[13px]">
      <span className="shrink-0 text-slip-muted uppercase">{label}</span>
      <span className="min-w-4 flex-1 translate-y-[-3px] border-b border-dotted border-slip-muted/50" aria-hidden />
      <span className="max-w-[60%] truncate text-right">{value}</span>
    </div>
  );
}

/** A interpretação da IA impressa como o comprovante de uma maquininha de cartão. */
export function DraftCard({ message, today, currency, isLatestPending, onConfirm, onEdit, onDiscard }: Props) {
  const { byId } = useCategories();
  const [confirming, setConfirming] = useState(false);
  const d = message.draft;
  const category = d.category_id ? byId.get(d.category_id) : undefined;
  const status = message.draft_status;
  const complete = d.amount !== null && Boolean(d.category_id);
  const isIncome = d.transaction_type === 'income';

  async function confirm() {
    setConfirming(true);
    try {
      await onConfirm();
    } catch {
      /* o erro já aparece em um aviso */
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className={`w-full max-w-[20rem] ${status === 'discarded' ? 'opacity-60' : ''}`}>
      <div className="receipt-wrap">
        <div className="receipt print-in px-5">
          <div className="flex flex-col items-center text-center">
            <CategoryIcon icon={category?.icon} color={category?.color} size="sm" />
            <p className="mt-1.5 text-[13px] font-semibold tracking-wide uppercase">
              {category?.name ?? d.category_name ?? 'Categoria a definir'}
            </p>
            <p className={`text-[11px] tracking-widest uppercase ${isIncome ? 'text-income' : 'text-slip-muted'}`}>
              {isIncome ? 'Receita' : 'Despesa'}
            </p>
          </div>

          <div className="receipt-rule my-3" />

          <div className="space-y-1.5">
            <Row label="Descrição" value={d.description || '—'} />
            <Row label="Data" value={friendlyDate(d.date, today)} />
          </div>

          <div className="receipt-rule my-3" />

          <div className="flex items-baseline justify-between">
            <span className="text-[13px] font-semibold tracking-wide uppercase">Total</span>
            <span className={`text-[24px] leading-none font-semibold tracking-tight ${d.amount === null ? 'text-slip-muted' : ''}`}>
              {d.amount === null ? 'R$ —' : `${isIncome ? '+' : ''}${formatMoney(d.amount, currency)}`}
            </span>
          </div>

          {status === 'confirmed' && (
            <p className="mt-4 flex items-center justify-center gap-1.5 text-[12px] font-semibold tracking-widest text-income uppercase">
              <Check className="size-4" aria-hidden /> {isIncome ? 'Receita registrada' : 'Despesa registrada'}
            </p>
          )}
          {status === 'discarded' && (
            <p className="mt-4 text-center text-[12px] tracking-widest text-slip-muted uppercase">Não registrado</p>
          )}
          {status === 'pending' && !complete && (
            <p className="mt-4 text-center text-[12px] tracking-wide text-slip-muted">{isLatestPending ? 'Responda abaixo para completar' : 'Incompleto'}</p>
          )}
        </div>
      </div>

      {status === 'pending' && (
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" onClick={confirm} loading={confirming} disabled={!complete} icon={<Check className="size-4" />}>
            Confirmar
          </Button>
          <Button size="sm" variant="secondary" onClick={onEdit} icon={<Pencil className="size-3.5" />}>
            Editar
          </Button>
          <Button size="sm" variant="ghost" onClick={onDiscard} aria-label="Descartar" title="Descartar">
            <X className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
