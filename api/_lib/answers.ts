// Executa as consultas no banco (via RPC, sob RLS) e redige a resposta.
// A IA só escolhe os parâmetros; todos os números vêm do Supabase.
import type { SupabaseClient } from '@supabase/supabase-js';
import { formatBRL } from './money.js';
import type { ResolvedQuery } from './types.js';

interface SummaryRow {
  expense_total: number;
  income_total: number;
  count: number;
  by_category: Array<{ name: string; total: number; count: number }>;
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export async function answerQuery(db: SupabaseClient, q: ResolvedQuery, currency: string): Promise<string> {
  const money = (n: number) => formatBRL(Number(n), currency);

  if (q.metric === 'balance' || q.metric === 'top_category') {
    const { data, error } = await db.rpc('finance_summary', { p_start: q.start, p_end: q.end });
    if (error) throw error;
    const s = data as SummaryRow;

    if (q.metric === 'balance') {
      const inc = Number(s.income_total);
      const exp = Number(s.expense_total);
      if (!s.count) return `Ainda não há registros ${q.label}.`;
      const bal = inc - exp;
      return `Saldo ${q.label}: ${money(bal)}${bal < 0 ? ' (negativo)' : ''}. Receitas de ${money(inc)} e despesas de ${money(exp)}.`;
    }

    const top = s.by_category[0];
    if (!top) return `Não encontrei despesas ${q.label}.`;
    const total = Number(s.expense_total);
    const pct = total > 0 ? Math.round((Number(top.total) / total) * 100) : 0;
    return `Sua maior categoria de gasto ${q.label} é ${top.name}: ${money(top.total)} (${pct}% das despesas, ${plural(Number(top.count), 'registro', 'registros')}).`;
  }

  const { data, error } = await db.rpc('finance_query', {
    p_start: q.start,
    p_end: q.end,
    p_type: q.transaction_type,
    p_category_id: q.category_id,
    p_search: q.search,
  });
  if (error) throw error;
  const r = data as { total: number; count: number };
  const total = Number(r.total);
  const count = Number(r.count);

  const scope = q.category_name ? ` com ${q.category_name}` : q.search ? ` com "${q.search}"` : '';
  const isIncome = q.transaction_type === 'income';

  if (q.metric === 'count') {
    return `Você tem ${plural(count, isIncome ? 'receita' : 'despesa', isIncome ? 'receitas' : 'despesas')}${scope} registradas ${q.label}.`;
  }
  if (count === 0) {
    return `Não encontrei ${isIncome ? 'receitas' : 'gastos'}${scope} ${q.label}.`;
  }
  return `Você ${isIncome ? 'recebeu' : 'gastou'} ${money(total)}${scope} ${q.label} (${plural(count, 'registro', 'registros')}).`;
}
