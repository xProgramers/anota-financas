import { ChevronLeft, ChevronRight, CreditCard as CardIcon, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Page, PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState, ErrorState, Spinner } from '../../components/ui/States';
import { errorMessage, formatMoney, todayIn } from '../../lib/format';
import type { CreditCard, Transaction } from '../../types/db';
import { useAuth } from '../auth/AuthProvider';
import { useCategories } from '../categories/CategoriesProvider';
import { CategoryIcon } from '../categories/CategoryIcon';
import { createTransaction, updateTransaction } from '../transactions/api';
import { TransactionModal } from '../transactions/TransactionModal';
import { deleteCard, listCardPurchases } from './api';
import { CardModal } from './CardModal';
import { useCards } from './CardsProvider';
import { billForDate, billLabel, billStatus, shiftBill, shortDate, type Bill, type BillStatus } from './cycle';

const STATUS: Record<BillStatus, { label: (b: Bill) => string; className: string }> = {
  open: { label: (b) => `Aberta, fecha ${shortDate(b.end)}`, className: 'bg-brand-soft text-brand' },
  closed: { label: (b) => `Fechada, vence ${shortDate(b.due)}`, className: 'bg-expense/10 text-expense' },
  overdue: { label: (b) => `Venceu ${shortDate(b.due)}`, className: 'bg-ink/5 text-muted' },
  future: { label: (b) => `Abre ${shortDate(b.start)}`, className: 'bg-ink/5 text-muted' },
};

export function CardsPage() {
  const { session, profile } = useAuth();
  const userId = session!.user.id;
  const currency = profile?.currency ?? 'BRL';
  const { today } = todayIn(profile?.timezone ?? 'America/Sao_Paulo');
  const { cards, loading, available, reload } = useCards();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const card = cards.find((c) => c.id === selectedId) ?? cards[0] ?? null;
  const [cardModal, setCardModal] = useState<{ card: CreditCard | null } | null>(null);
  const [toDelete, setToDelete] = useState<CreditCard | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteCard(toDelete.id);
      await reload();
      setSelectedId(null);
      toast.success('Cartão excluído');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDeleting(false);
      setToDelete(null);
    }
  }

  return (
    <Page>
      <PageHeader
        title="Cartão de crédito"
        description="Cada compra da fatura com o que foi, onde e quando. Sem susto na hora de pagar."
        actions={
          available &&
          cards.length > 0 && (
            <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => setCardModal({ card: null })}>
              Novo cartão
            </Button>
          )
        }
      />

      {loading ? (
        <Spinner />
      ) : !available ? (
        <EmptyState title="A área de cartões ainda não está pronta">Tente de novo em alguns minutos.</EmptyState>
      ) : !card ? (
        <EmptyState
          title="Nenhum cartão cadastrado"
          action={
            <Button icon={<Plus className="size-4" />} onClick={() => setCardModal({ card: null })}>
              Cadastrar cartão
            </Button>
          }
        >
          Cadastre seu cartão com o dia de fechamento e de vencimento. Depois, marque as despesas que passou nele e veja a fatura de cada mês,
          compra por compra.
        </EmptyState>
      ) : (
        <>
          {cards.length > 1 && (
            <div className="-mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Cartões">
              {cards.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={c.id === card.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
                    c.id === card.id ? 'border-ink bg-ink text-paper' : 'border-line bg-surface text-ink hover:border-ink/40'
                  }`}
                >
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: c.color }} aria-hidden />
                  {c.name}
                </button>
              ))}
            </div>
          )}

          <CardBill
            key={card.id}
            card={card}
            userId={userId}
            currency={currency}
            today={today}
            onEdit={() => setCardModal({ card })}
            onDelete={() => setToDelete(card)}
          />
        </>
      )}

      <CardModal
        open={Boolean(cardModal)}
        card={cardModal?.card ?? null}
        onClose={() => setCardModal(null)}
        onSaved={(saved) => {
          setCardModal(null);
          setSelectedId(saved.id);
        }}
      />

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Excluir cartão?"
        message={toDelete ? `O cartão “${toDelete.name}” será excluído. As compras continuam salvas nas suas transações.` : ''}
        confirmLabel="Excluir"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        onClose={() => setToDelete(null)}
      />
    </Page>
  );
}

interface BillProps {
  card: CreditCard;
  userId: string;
  currency: string;
  today: string;
  onEdit: () => void;
  onDelete: () => void;
}

function CardBill({ card, userId, currency, today, onEdit, onDelete }: BillProps) {
  const { byId, categories } = useCategories();
  const current = useMemo(() => billForDate(card, today), [card, today]);
  const [bill, setBill] = useState<Bill>(current);
  const [rows, setRows] = useState<Transaction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; tx: Transaction } | null>(null);

  // Dias de fechamento/vencimento mudaram: volta para a fatura atual.
  useEffect(() => setBill(current), [current]);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await listCardPurchases(card.id, bill.start, bill.end));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [card.id, bill.start, bill.end]);

  useEffect(() => {
    setRows(null);
    void load();
  }, [load]);

  const total = rows?.reduce((s, t) => s + Number(t.amount), 0) ?? 0;
  const status = billStatus(bill, today);
  const isCurrent = bill.closingMonth === current.closingMonth;
  const fallbackCategory = categories.find((c) => c.type === 'expense' && c.name === 'Outros') ?? categories.find((c) => c.type === 'expense');

  return (
    <section aria-label={`Fatura do cartão ${card.name}`}>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex items-center gap-3 px-5 py-4 text-white" style={{ background: `linear-gradient(135deg, ${card.color}, ${card.color}cc)` }}>
          <CardIcon className="size-5 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{card.name}</p>
            <p className="text-sm text-white/80">
              Fecha dia {card.closing_day}, vence dia {card.due_day}
            </p>
          </div>
          <button type="button" onClick={onEdit} className="rounded-md p-2 text-white/80 hover:bg-white/15 hover:text-white" aria-label="Editar cartão">
            <Pencil className="size-4" />
          </button>
          <button type="button" onClick={onDelete} className="rounded-md p-2 text-white/80 hover:bg-white/15 hover:text-white" aria-label="Excluir cartão">
            <Trash2 className="size-4" />
          </button>
        </div>

        <div className="px-5 py-4">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setBill((b) => shiftBill(card, b, -1))}
              className="rounded-md p-2 text-muted hover:bg-ink/5 hover:text-ink"
              aria-label="Fatura anterior"
            >
              <ChevronLeft className="size-5" />
            </button>
            <div className="text-center">
              <p className="font-semibold">{billLabel(bill, today)}</p>
              <p className="text-sm text-muted">
                Compras de {shortDate(bill.start)} a {shortDate(bill.end)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setBill((b) => shiftBill(card, b, 1))}
              className="rounded-md p-2 text-muted hover:bg-ink/5 hover:text-ink"
              aria-label="Próxima fatura"
            >
              <ChevronRight className="size-5" />
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm text-muted">Total</p>
              <p className="font-mono text-3xl font-semibold tracking-tight">{rows ? formatMoney(total, currency) : '…'}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS[status].className}`}>{STATUS[status].label(bill)}</span>
              {!isCurrent && (
                <button type="button" onClick={() => setBill(current)} className="text-sm font-medium text-brand hover:underline">
                  Ir para a fatura atual
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 mb-3 flex items-center justify-between gap-3">
        <h2 className="font-semibold">
          {rows ? `${rows.length} ${rows.length === 1 ? 'compra' : 'compras'}` : 'Compras'}
        </h2>
        <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setModal({ mode: 'create' })}>
          Adicionar compra
        </Button>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-muted">
          Nenhuma compra nesta fatura. Ao anotar um gasto no chat, toque no nome do cartão no comprovante para trazê-lo para cá.
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {rows.map((tx) => {
            const cat = tx.category_id ? byId.get(tx.category_id) : undefined;
            return (
              <li key={tx.id}>
                <button
                  type="button"
                  onClick={() => setModal({ mode: 'edit', tx })}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-paper"
                >
                  <CategoryIcon icon={cat?.icon} color={cat?.color} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium">{tx.description || cat?.name || 'Sem descrição'}</p>
                    {tx.place && (
                      <p className="flex min-w-0 items-center gap-1 text-sm text-ink/80">
                        <MapPin className="size-3.5 shrink-0" aria-hidden />
                        <span className="truncate">{tx.place}</span>
                      </p>
                    )}
                    <p className="truncate text-sm text-muted">
                      {shortDate(tx.transaction_date)} · {cat?.name ?? 'Sem categoria'}
                    </p>
                  </div>
                  <p className="shrink-0 font-mono text-[15px] font-semibold">{formatMoney(Number(tx.amount), tx.currency)}</p>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {modal && (
        <TransactionModal
          open
          title={modal.mode === 'create' ? `Compra no ${card.name}` : 'Editar compra'}
          submitLabel={modal.mode === 'create' ? 'Adicionar' : 'Salvar alterações'}
          initial={
            modal.mode === 'create'
              ? {
                  type: 'expense',
                  amount: null,
                  category_id: fallbackCategory?.id ?? null,
                  description: '',
                  transaction_date: isCurrent || status === 'future' ? today : bill.end,
                  card_id: card.id,
                  place: '',
                }
              : {
                  type: modal.tx.type,
                  amount: Number(modal.tx.amount),
                  category_id: modal.tx.category_id,
                  description: modal.tx.description,
                  transaction_date: modal.tx.transaction_date,
                  card_id: modal.tx.card_id ?? null,
                  place: modal.tx.place ?? '',
                }
          }
          onClose={() => setModal(null)}
          onSubmit={async (values) => {
            try {
              if (modal.mode === 'create') {
                await createTransaction(userId, values, currency);
                toast.success('Compra adicionada');
              } else {
                await updateTransaction(modal.tx.id, values);
                toast.success('Compra atualizada');
              }
            } catch (err) {
              throw new Error(errorMessage(err));
            }
            setModal(null);
            void load();
          }}
        />
      )}
    </section>
  );
}
