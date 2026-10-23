import { ArrowLeft, PartyPopper, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Page, PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState, ErrorState, Spinner } from '../../components/ui/States';
import { errorMessage, formatMoney } from '../../lib/format';
import type { SavingsGoal, SavingsGoalCell } from '../../types/db';
import { useAuth } from '../auth/AuthProvider';
import { deleteGoal, getGoal, setCellMarked } from './api';

const monthFmt = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const dayFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

export function GoalBoardPage() {
  const { id = '' } = useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const currency = profile?.currency ?? 'BRL';
  const money = (n: number) => formatMoney(n, currency);

  const [goal, setGoal] = useState<SavingsGoal | null>(null);
  const [cells, setCells] = useState<SavingsGoalCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [unmarking, setUnmarking] = useState<SavingsGoalCell | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await getGoal(id);
      setGoal(r.goal);
      setCells(r.cells);
    } catch (err) {
      setError(errorMessage(err));
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const target = Number(goal?.target ?? 0);
  const saved = cells.reduce((s, c) => s + (c.marked_at ? Number(c.amount) : 0), 0);
  const markedCount = cells.filter((c) => c.marked_at).length;
  const done = cells.length > 0 && markedCount === cells.length;
  const pct = target > 0 ? Math.min(100, (saved / target) * 100) : 0;

  async function toggle(cell: SavingsGoalCell, marked: boolean) {
    if (busy.has(cell.id)) return;
    const willComplete = marked && markedCount === cells.length - 1;
    const optimistic = marked ? new Date().toISOString() : null;
    setBusy((b) => new Set(b).add(cell.id));
    setCells((cs) => cs.map((c) => (c.id === cell.id ? { ...c, marked_at: optimistic } : c)));
    try {
      const updated = await setCellMarked(cell.id, marked);
      setCells((cs) => cs.map((c) => (c.id === cell.id ? updated : c)));
      if (willComplete) toast.success('Meta atingida! Parabéns!');
      else if (marked)
        toast.success(`${money(Number(cell.amount))} guardado`, {
          action: { label: 'Desfazer', onClick: () => void toggle(updated, false) },
        });
    } catch (err) {
      setCells((cs) => cs.map((c) => (c.id === cell.id ? cell : c)));
      toast.error(errorMessage(err));
    } finally {
      setBusy((b) => {
        const n = new Set(b);
        n.delete(cell.id);
        return n;
      });
    }
  }

  async function remove() {
    setDeleteBusy(true);
    try {
      await deleteGoal(id);
      toast.success('Meta excluída');
      navigate('/metas', { replace: true });
    } catch (err) {
      toast.error(errorMessage(err));
      setDeleteBusy(false);
    }
  }

  // Registros por mês e, dentro do mês, por dia; do mais recente para o mais antigo.
  const history = useMemo(() => {
    const marked = cells.filter((c) => c.marked_at).sort((a, b) => b.marked_at!.localeCompare(a.marked_at!));
    type Day = { label: string; total: number; count: number };
    const groups: Array<{ key: string; label: string; total: number; days: Day[] }> = [];
    for (const c of marked) {
      const d = new Date(c.marked_at!);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      let g = groups.find((x) => x.key === key);
      if (!g) groups.push((g = { key, label: monthFmt.format(d), total: 0, days: [] }));
      const label = dayFmt.format(d);
      let day = g.days.find((x) => x.label === label);
      if (!day) g.days.push((day = { label, total: 0, count: 0 }));
      g.total += Number(c.amount);
      day.total += Number(c.amount);
      day.count += 1;
    }
    return groups;
  }, [cells]);

  if (loading) return <Page><Spinner /></Page>;
  if (error) return <Page><ErrorState message={error} onRetry={() => void load()} /></Page>;
  if (!goal)
    return (
      <Page>
        <EmptyState title="Meta não encontrada" action={<Button onClick={() => navigate('/metas')}>Ver metas</Button>} />
      </Page>
    );

  return (
    <Page>
      <Link to="/metas" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden />
        Metas
      </Link>
      <PageHeader
        title={goal.name}
        actions={
          <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} onClick={() => setDeleting(true)}>
            Excluir
          </Button>
        }
      />

      <section aria-label="Progresso" className="mb-6">
        <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-line bg-surface">
          <Stat label="Guardado" value={money(saved)} className={done ? 'text-income' : 'text-brand'} />
          <Stat label="Meta" value={money(target)} />
          <Stat label="Falta" value={money(Math.max(0, target - saved))} />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div
            className="h-2.5 flex-1 rounded-full bg-line/60"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct)}
            aria-label="Progresso da meta"
          >
            <div className={`h-2.5 rounded-full transition-all ${done ? 'bg-income' : 'bg-brand'}`} style={{ width: `${pct}%` }} />
          </div>
          <span className="w-12 text-right font-mono text-sm font-semibold">{Math.floor(pct)}%</span>
        </div>
        <p className="mt-1.5 text-sm text-muted">
          {markedCount} de {cells.length} casinhas marcadas
        </p>
      </section>

      {done && (
        <div role="status" className="mb-6 flex items-start gap-3 rounded-xl border border-income/30 bg-income/10 px-4 py-3 text-income">
          <PartyPopper className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">Meta atingida!</p>
            <p className="text-sm">Você juntou {money(target)}. Quadro completo.</p>
          </div>
        </div>
      )}

      <section aria-label="Quadro" className="rounded-2xl border border-line bg-surface p-3 shadow-sm sm:p-5">
        <p className="mb-3 text-sm text-muted">Toque no valor que você guardou para marcar.</p>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1.5 sm:grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] sm:gap-2">
          {cells.map((c) => {
            const marked = Boolean(c.marked_at);
            const value = Number(c.amount);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => (marked ? setUnmarking(c) : void toggle(c, true))}
                  disabled={busy.has(c.id)}
                  aria-pressed={marked}
                  aria-label={marked ? `${money(value)}, guardado em ${dayFmt.format(new Date(c.marked_at!))}` : `Marcar ${money(value)}`}
                  title={marked ? `Guardado em ${dayFmt.format(new Date(c.marked_at!))}` : undefined}
                  className={`flex aspect-square w-full items-center justify-center rounded-full border-2 font-mono font-semibold transition active:scale-95 ${
                    value >= 100 ? 'text-[13px]' : 'text-sm sm:text-base'
                  } ${
                    marked
                      ? done
                        ? 'border-income bg-income text-paper'
                        : 'border-brand bg-brand text-brand-ink'
                      : 'border-line bg-paper text-ink hover:border-brand/60'
                  }`}
                >
                  {value}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mx-auto mt-4 w-fit rounded-lg border border-line px-4 py-1 font-mono text-sm font-semibold">{money(target)}</p>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-base font-semibold">Registros</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted">Nada guardado ainda. Marque a primeira casinha quando separar o dinheiro.</p>
        ) : (
          <div className="space-y-5">
            {history.map((g) => (
              <div key={g.key}>
                <div className="mb-1.5 flex items-baseline justify-between border-b border-line pb-1.5">
                  <p className="text-sm font-semibold first-letter:uppercase">{g.label}</p>
                  <p className="font-mono text-sm font-semibold text-income">+{money(g.total)}</p>
                </div>
                <ul className="divide-y divide-line/60 text-sm">
                  {g.days.map((d) => (
                    <li key={d.label} className="flex justify-between gap-3 py-1.5">
                      <span className="text-muted">
                        {d.label} · {d.count} {d.count === 1 ? 'casinha' : 'casinhas'}
                      </span>
                      <span className="font-mono">{money(d.total)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(unmarking)}
        title="Desmarcar casinha?"
        message={
          unmarking
            ? `${money(Number(unmarking.amount))} foi marcado em ${dayFmt.format(new Date(unmarking.marked_at!))}. O valor sai do total guardado.`
            : ''
        }
        confirmLabel="Desmarcar"
        onClose={() => setUnmarking(null)}
        onConfirm={() => {
          if (unmarking) void toggle(unmarking, false);
          setUnmarking(null);
        }}
      />
      <ConfirmDialog
        open={deleting}
        title="Excluir meta?"
        message={`O quadro "${goal.name}" e todos os registros serão apagados.`}
        confirmLabel="Excluir"
        loading={deleteBusy}
        onClose={() => setDeleting(false)}
        onConfirm={() => void remove()}
      />
    </Page>
  );
}

function Stat({ label, value, className = 'text-ink' }: { label: string; value: string; className?: string }) {
  return (
    <div className="border-r border-line px-3 py-3 last:border-r-0 sm:px-5 sm:py-4">
      <p className="text-xs text-muted sm:text-sm">{label}</p>
      <p className={`mt-0.5 truncate font-mono text-sm font-semibold tracking-tight sm:text-xl ${className}`}>{value}</p>
    </div>
  );
}
