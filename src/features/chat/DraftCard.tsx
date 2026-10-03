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

/** A interpretação da IA impressa como um cupom, antes de virar transação. */
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
      /* o hook já mostra o erro */
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className={`w-full max-w-[22rem] ${status === 'discarded' ? 'opacity-55' : ''}`}>
      <div className={`receipt print-in rounded-t-xl border-x border-t border-line px-4 pt-4 shadow-[0_1px_0_var(--line)]`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <CategoryIcon icon={category?.icon} color={category?.color} size="sm" />
            <span className="truncate text-sm font-medium">{category?.name ?? d.category_name ?? 'Categoria a definir'}</span>
          </div>
          <span className={`shrink-0 text-xs font-medium ${isIncome ? 'text-income' : 'text-expense'}`}>{isIncome ? 'Receita' : 'Despesa'}</span>
        </div>

        <p className={`mt-4 font-mono text-[28px] leading-none font-semibold tracking-tight ${d.amount === null ? 'text-muted' : ''}`}>
          {d.amount === null ? 'R$ —' : `${isIncome ? '+ ' : ''}${formatMoney(d.amount, currency)}`}
        </p>

        <div className="dotted-rule mt-4 pt-3">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted">Descrição</dt>
            <dd className="truncate text-right">{d.description || '—'}</dd>
            <dt className="text-muted">Data</dt>
            <dd className="text-right">{friendlyDate(d.date, today)}</dd>
          </dl>
        </div>

        {status === 'confirmed' && (
          <p className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-income">
            <Check className="size-4" aria-hidden /> {isIncome ? 'Receita registrada' : 'Despesa registrada'}
          </p>
        )}
        {status === 'discarded' && <p className="mt-4 text-sm text-muted">Não registrado</p>}
      </div>

      {status === 'pending' && (
        <div className="mt-2 flex items-center gap-2">
          <Button size="sm" onClick={confirm} loading={confirming} disabled={!complete} icon={<Check className="size-4" />}>
            Confirmar
          </Button>
          <Button size="sm" variant="secondary" onClick={onEdit} icon={<Pencil className="size-3.5" />}>
            Editar
          </Button>
          <Button size="sm" variant="ghost" onClick={onDiscard} aria-label="Descartar" title="Descartar">
            <X className="size-4" />
          </Button>
          {!complete && isLatestPending && <span className="text-xs text-muted">Responda abaixo</span>}
        </div>
      )}
    </div>
  );
}
