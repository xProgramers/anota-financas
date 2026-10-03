import { ArrowDownUp, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Page, PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { inputClass } from '../../components/ui/Field';
import { EmptyState, ErrorState, Spinner } from '../../components/ui/States';
import { addDays, endOfMonth, errorMessage, formatMoney, friendlyDate, shiftMonth, startOfMonth, todayIn } from '../../lib/format';
import type { Transaction, TxType } from '../../types/db';
import { useAuth } from '../auth/AuthProvider';
import { useCategories } from '../categories/CategoriesProvider';
import { CategoryIcon } from '../categories/CategoryIcon';
import { createTransaction, deleteTransaction, listTransactions, PAGE_SIZE, updateTransaction, type TransactionFilters } from './api';
import { TransactionModal } from './TransactionModal';

type Period = 'this_month' | 'last_month' | 'last_30' | 'this_year' | 'all' | 'custom';

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function TransactionsPage() {
  const { session, profile } = useAuth();
  const userId = session!.user.id;
  const currency = profile?.currency ?? 'BRL';
  const { today } = todayIn(profile?.timezone ?? 'America/Sao_Paulo');
  const { categories, byId } = useCategories();

  const [search, setSearch] = useState('');
  const [type, setType] = useState<TxType | ''>('');
  const [categoryId, setCategoryId] = useState('');
  const [period, setPeriod] = useState<Period>('this_month');
  const [customStart, setCustomStart] = useState(startOfMonth(today));
  const [customEnd, setCustomEnd] = useState(today);
  const [order, setOrder] = useState<'desc' | 'asc'>('desc');
  const debouncedSearch = useDebounced(search);

  const [rows, setRows] = useState<Transaction[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; tx: Transaction } | null>(null);
  const [toDelete, setToDelete] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filters = useMemo<TransactionFilters>(() => {
    const range = (() => {
      switch (period) {
        case 'this_month':
          return { start: startOfMonth(today), end: endOfMonth(today) };
        case 'last_month': {
          const s = shiftMonth(today, -1);
          return { start: s, end: endOfMonth(s) };
        }
        case 'last_30':
          return { start: addDays(today, -29), end: today };
        case 'this_year':
          return { start: `${today.slice(0, 4)}-01-01`, end: `${today.slice(0, 4)}-12-31` };
        case 'custom':
          return { start: customStart || undefined, end: customEnd || undefined };
        default:
          return {};
      }
    })();
    return { search: debouncedSearch, type, categoryId: categoryId || undefined, order, ...range };
  }, [debouncedSearch, type, categoryId, order, period, customStart, customEnd, today]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listTransactions(userId, filters, 0);
      setRows(res.rows);
      setCount(res.count);
      setPage(0);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [userId, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const res = await listTransactions(userId, filters, page + 1);
      setRows((prev) => [...prev, ...res.rows]);
      setPage(page + 1);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteTransaction(toDelete.id);
      setRows((prev) => prev.filter((r) => r.id !== toDelete.id));
      setCount((c) => c - 1);
      toast.success('Transação excluída');
      setToDelete(null);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  const categoryOptions = categories.filter((c) => !type || c.type === type);
  const hasFilters = Boolean(search || type || categoryId || period !== 'this_month');
  const expenseCategory = categories.find((c) => c.type === 'expense' && c.name === 'Outros');

  return (
    <Page>
      <PageHeader
        title="Transações"
        description={loading ? ' ' : `${count} ${count === 1 ? 'transação' : 'transações'} no filtro atual`}
        actions={
          <Button onClick={() => setModal({ mode: 'create' })} icon={<Plus className="size-4" />}>
            Nova transação
          </Button>
        }
      />

      <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto]">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            placeholder="Buscar descrição"
            aria-label="Buscar descrição"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputClass} pl-9`}
          />
        </div>
        <select aria-label="Tipo" value={type} onChange={(e) => { setType(e.target.value as TxType | ''); setCategoryId(''); }} className={inputClass}>
          <option value="">Receitas e despesas</option>
          <option value="expense">Despesas</option>
          <option value="income">Receitas</option>
        </select>
        <select aria-label="Categoria" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass}>
          <option value="">Todas as categorias</option>
          {categoryOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {!type && c.name === 'Outros' ? (c.type === 'income' ? ' (receita)' : ' (despesa)') : ''}
            </option>
          ))}
        </select>
        <select aria-label="Período" value={period} onChange={(e) => setPeriod(e.target.value as Period)} className={inputClass}>
          <option value="this_month">Este mês</option>
          <option value="last_month">Mês passado</option>
          <option value="last_30">Últimos 30 dias</option>
          <option value="this_year">Este ano</option>
          <option value="all">Todo o período</option>
          <option value="custom">Personalizado</option>
        </select>
        <button
          type="button"
          onClick={() => setOrder((o) => (o === 'desc' ? 'asc' : 'desc'))}
          className={`${inputClass} inline-flex items-center justify-center gap-2 lg:w-auto`}
          aria-label={order === 'desc' ? 'Ordenado: mais recentes primeiro' : 'Ordenado: mais antigas primeiro'}
        >
          <ArrowDownUp className="size-4" aria-hidden />
          {order === 'desc' ? 'Recentes' : 'Antigas'}
        </button>
        {period === 'custom' && (
          <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-5 lg:max-w-md">
            <input type="date" aria-label="De" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className={inputClass} />
            <input type="date" aria-label="Até" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className={inputClass} />
          </div>
        )}
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={hasFilters ? 'Nada encontrado com esses filtros' : 'Nenhuma transação neste mês'}
          action={
            hasFilters ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch('');
                  setType('');
                  setCategoryId('');
                  setPeriod('this_month');
                }}
              >
                Limpar filtros
              </Button>
            ) : (
              <Button onClick={() => setModal({ mode: 'create' })} icon={<Plus className="size-4" />}>
                Nova transação
              </Button>
            )
          }
        >
          {!hasFilters && 'Anote pelo chat ou adicione manualmente.'}
        </EmptyState>
      ) : (
        <>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {rows.map((tx) => {
              const cat = tx.category_id ? byId.get(tx.category_id) : undefined;
              const income = tx.type === 'income';
              return (
                <li key={tx.id} className="group flex items-center gap-3 px-4 py-3">
                  <CategoryIcon icon={cat?.icon} color={cat?.color} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium">{tx.description || cat?.name || 'Sem descrição'}</p>
                    <p className="truncate text-sm text-muted">
                      {cat?.name ?? 'Sem categoria'}, {friendlyDate(tx.transaction_date, today).toLowerCase()}
                    </p>
                  </div>
                  <p className={`shrink-0 font-mono text-[15px] font-semibold ${income ? 'text-income' : 'text-ink'}`}>
                    {income ? '+' : '−'} {formatMoney(Number(tx.amount), tx.currency)}
                  </p>
                  <div className="flex shrink-0 gap-0.5 md:opacity-0 md:transition md:group-focus-within:opacity-100 md:group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => setModal({ mode: 'edit', tx })}
                      className="rounded-md p-2 text-muted hover:bg-ink/5 hover:text-ink"
                      aria-label={`Editar ${tx.description || 'transação'}`}
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setToDelete(tx)}
                      className="rounded-md p-2 text-muted hover:bg-danger/10 hover:text-danger"
                      aria-label={`Excluir ${tx.description || 'transação'}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {rows.length < count && (
            <div className="mt-4 flex justify-center">
              <Button variant="secondary" onClick={() => void loadMore()} loading={loadingMore}>
                Carregar mais {Math.min(PAGE_SIZE, count - rows.length)}
              </Button>
            </div>
          )}
        </>
      )}

      {modal && (
        <TransactionModal
          open
          title={modal.mode === 'create' ? 'Nova transação' : 'Editar transação'}
          submitLabel={modal.mode === 'create' ? 'Adicionar' : 'Salvar alterações'}
          initial={
            modal.mode === 'create'
              ? { type: 'expense', amount: null, category_id: expenseCategory?.id ?? null, description: '', transaction_date: today }
              : {
                  type: modal.tx.type,
                  amount: Number(modal.tx.amount),
                  category_id: modal.tx.category_id,
                  description: modal.tx.description,
                  transaction_date: modal.tx.transaction_date,
                }
          }
          onClose={() => setModal(null)}
          onSubmit={async (values) => {
            try {
              if (modal.mode === 'create') {
                await createTransaction(userId, values, currency);
                toast.success('Transação adicionada');
              } else {
                await updateTransaction(modal.tx.id, values);
                toast.success('Transação atualizada');
              }
            } catch (err) {
              throw new Error(errorMessage(err));
            }
            setModal(null);
            void load();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Excluir transação?"
        message={
          toDelete
            ? `“${toDelete.description || 'Sem descrição'}” de ${formatMoney(Number(toDelete.amount), toDelete.currency)} será excluída permanentemente.`
            : ''
        }
        confirmLabel="Excluir"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        onClose={() => setToDelete(null)}
      />
    </Page>
  );
}
