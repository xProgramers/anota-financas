import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page, PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorState, Spinner } from '../../components/ui/States';
import { addDays, endOfMonth, errorMessage, formatMoney, shiftMonth, startOfMonth, todayIn } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import type { Summary } from '../../types/db';
import { useAuth } from '../auth/AuthProvider';
import { CategoryIcon } from '../categories/CategoryIcon';

const monthFmt = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function DashboardPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const currency = profile?.currency ?? 'BRL';
  const { today } = todayIn(profile?.timezone ?? 'America/Sao_Paulo');
  const [month, setMonth] = useState(startOfMonth(today));
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isCurrent = month === startOfMonth(today);
  const end = isCurrent ? today : endOfMonth(month);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc('finance_summary', { p_start: month, p_end: endOfMonth(month) });
    if (error) setError(errorMessage(error));
    else setData(data as Summary);
    setLoading(false);
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const money = (n: number) => formatMoney(Number(n), currency);
  const label = monthFmt.format(new Date(`${month}T00:00:00Z`));

  return (
    <Page>
      <PageHeader
        title="Resumo"
        actions={
          <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-1">
            <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} className="rounded-md p-1.5 text-muted hover:bg-ink/5 hover:text-ink" aria-label="Mês anterior">
              <ChevronLeft className="size-4" />
            </button>
            <span className="min-w-36 text-center text-sm font-medium first-letter:uppercase" aria-live="polite">
              {label}
            </span>
            <button
              type="button"
              onClick={() => setMonth(shiftMonth(month, 1))}
              disabled={isCurrent}
              className="rounded-md p-1.5 text-muted hover:bg-ink/5 hover:text-ink disabled:opacity-30"
              aria-label="Próximo mês"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        }
      />

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !data || data.count === 0 ? (
        <EmptyState
          title={isCurrent ? 'Nenhuma transação neste mês ainda' : 'Nenhuma transação neste mês'}
          action={
            isCurrent && <Button onClick={() => navigate('/')}>Anotar um gasto</Button>
          }
        >
          {isCurrent && 'Assim que você anotar, o resumo aparece aqui.'}
        </EmptyState>
      ) : (
        <div className="space-y-8">
          <section aria-label="Totais do mês" className="grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-surface lg:grid-cols-4">
            <Stat label="Gastos" value={money(data.expense_total)} tone="expense" />
            <Stat label="Receitas" value={money(data.income_total)} tone="income" />
            <Stat
              label="Saldo"
              value={money(Number(data.income_total) - Number(data.expense_total))}
              tone={Number(data.income_total) - Number(data.expense_total) < 0 ? 'expense' : 'neutral'}
            />
            <Stat label="Transações" value={String(data.count)} tone="neutral" />
          </section>

          <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
            <CategoryBreakdown data={data} money={money} />
            <DailyChart data={data} start={month} end={end} money={money} />
          </div>
        </div>
      )}
    </Page>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'expense' | 'income' | 'neutral' }) {
  const color = tone === 'expense' ? 'text-expense' : tone === 'income' ? 'text-income' : 'text-ink';
  return (
    <div className="border-line px-5 py-4 [&:nth-child(odd)]:border-r lg:border-r lg:last:border-r-0 [&:nth-child(-n+2)]:border-b lg:[&:nth-child(-n+2)]:border-b-0">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 truncate font-mono text-xl font-semibold tracking-tight md:text-2xl ${color}`}>{value}</p>
    </div>
  );
}

function CategoryBreakdown({ data, money }: { data: Summary; money: (n: number) => string }) {
  const max = Math.max(...data.by_category.map((c) => Number(c.total)), 1);
  const total = Number(data.expense_total) || 1;
  return (
    <section>
      <h2 className="mb-4 text-base font-semibold">Despesas por categoria</h2>
      {data.by_category.length === 0 ? (
        <p className="text-sm text-muted">Nenhuma despesa neste mês.</p>
      ) : (
        <ul className="space-y-4">
          {data.by_category.map((c) => (
            <li key={c.category_id ?? 'none'}>
              <div className="mb-1.5 flex items-center gap-2.5">
                <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                <span className="flex-1 truncate text-sm font-medium">{c.name}</span>
                <span className="font-mono text-sm font-semibold">{money(c.total)}</span>
                <span className="w-10 text-right text-xs text-muted">{Math.round((Number(c.total) / total) * 100)}%</span>
              </div>
              <div className="h-2 rounded-full bg-line/60" aria-hidden>
                <div className="h-2 rounded-full" style={{ width: `${(Number(c.total) / max) * 100}%`, backgroundColor: c.color }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DailyChart({ data, start, end, money }: { data: Summary; start: string; end: string; money: (n: number) => string }) {
  const days = useMemo(() => {
    const map = new Map(data.by_day.map((d) => [d.day, Number(d.expense ?? 0)]));
    const out: Array<{ day: string; value: number }> = [];
    for (let d = start; d <= end; d = addDays(d, 1)) out.push({ day: d, value: map.get(d) ?? 0 });
    return out;
  }, [data, start, end]);

  const max = Math.max(...days.map((d) => d.value), 1);
  const W = 100 / days.length;
  const peak = days.reduce((a, b) => (b.value > a.value ? b : a), days[0]);

  return (
    <section>
      <h2 className="mb-1 text-base font-semibold">Gastos por dia</h2>
      <p className="mb-4 text-sm text-muted">
        {peak && peak.value > 0 ? `Dia de maior gasto: ${peak.day.slice(8)}/${peak.day.slice(5, 7)}, ${money(peak.value)}` : 'Sem gastos no período.'}
      </p>
      <div className="relative h-44 rounded-xl border border-line bg-surface px-3 pt-4 pb-6">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full" role="img" aria-label="Gráfico de gastos por dia">
          <line x1="0" x2="100" y1="100" y2="100" stroke="var(--line)" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
          {days.map((d, i) => {
            const h = (d.value / max) * 96;
            return (
              <rect key={d.day} x={i * W + W * 0.18} width={W * 0.64} y={100 - h} height={h} rx={0.6} fill="var(--brand)" opacity={d.value === peak.value && d.value > 0 ? 1 : 0.55}>
                <title>{`${d.day.slice(8)}/${d.day.slice(5, 7)}: ${money(d.value)}`}</title>
              </rect>
            );
          })}
        </svg>
        <div className="absolute inset-x-3 bottom-1.5 flex justify-between text-[11px] text-muted" aria-hidden>
          <span>{start.slice(8)}</span>
          <span>{days[Math.floor(days.length / 2)]?.day.slice(8)}</span>
          <span>{end.slice(8)}</span>
        </div>
      </div>
      <table className="sr-only">
        <caption>Gastos por dia</caption>
        <tbody>
          {days
            .filter((d) => d.value > 0)
            .map((d) => (
              <tr key={d.day}>
                <th>{d.day}</th>
                <td>{money(d.value)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </section>
  );
}
