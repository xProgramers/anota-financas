import { CheckCircle2, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Page, PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorState, Spinner } from '../../components/ui/States';
import { errorMessage, formatMoney } from '../../lib/format';
import { useAuth } from '../auth/AuthProvider';
import { listGoals, type GoalWithProgress } from './api';
import { NewGoalModal } from './NewGoalModal';

export function GoalsPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const currency = profile?.currency ?? 'BRL';
  const [goals, setGoals] = useState<GoalWithProgress[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setGoals(await listGoals());
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Page>
      <PageHeader
        title="Metas"
        description="Escolha quanto quer guardar e vá marcando as casinhas."
        actions={
          goals && goals.length > 0 && (
            <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Nova meta
            </Button>
          )
        }
      />

      {error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !goals ? (
        <Spinner />
      ) : goals.length === 0 ? (
        <EmptyState
          title="Nenhuma meta ainda"
          action={
            <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Criar meta
            </Button>
          }
        >
          Diga quanto quer juntar e o app monta um quadro com valores de R$ 5 a R$ 100. Cada vez que guardar um desses valores, marque a casinha.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {goals.map((g) => {
            const done = g.cells > 0 && g.marked === g.cells;
            const pct = Math.min(100, (g.saved / Number(g.target)) * 100);
            return (
              <li key={g.id}>
                <Link to={`/metas/${g.id}`} className="block rounded-xl border border-line bg-surface p-5 transition hover:border-brand/50">
                  <div className="flex items-start justify-between gap-3">
                    <p className="truncate font-semibold">{g.name}</p>
                    {done && (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-income/10 px-2 py-0.5 text-xs font-semibold text-income">
                        <CheckCircle2 className="size-3.5" aria-hidden />
                        Concluída
                      </span>
                    )}
                  </div>
                  <p className="mt-3 font-mono text-lg font-semibold">
                    {formatMoney(g.saved, currency)}
                    <span className="text-sm font-normal text-muted"> de {formatMoney(Number(g.target), currency)}</span>
                  </p>
                  <div className="mt-2 h-2 rounded-full bg-line/60" aria-hidden>
                    <div className={`h-2 rounded-full ${done ? 'bg-income' : 'bg-brand'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-2 text-sm text-muted">
                    {g.marked} de {g.cells} casinhas marcadas
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <NewGoalModal
        open={creating}
        currency={currency}
        onClose={() => setCreating(false)}
        onCreated={(id) => navigate(`/metas/${id}`)}
      />
    </Page>
  );
}
