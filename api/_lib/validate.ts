// Validação rigorosa da resposta da IA. Nada é salvo sem passar por aqui.
import { isValidISODate } from './dates.js';
import { normalizeAmount } from './money.js';
import type { Intent, Interpretation, QueryMetric, QueryPeriod, QuerySpec, TxType } from './types.js';

export class InvalidAIResponse extends Error {}

const INTENTS: Intent[] = ['new_transaction', 'update_pending', 'confirm_pending', 'cancel_pending', 'query', 'other'];
const METRICS: QueryMetric[] = ['total', 'count', 'balance', 'top_category'];
const PERIODS: QueryPeriod[] = [
  'today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'this_year', 'last_7_days', 'last_30_days', 'custom',
];

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

function txType(v: unknown): TxType | null {
  return oneOf(v, ['expense', 'income'] as const);
}

/** Extrai JSON mesmo se vier cercado por ```json ... ``` ou texto extra. */
export function parseJSONLoose(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidate = fenced ? fenced[1] : raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      throw new InvalidAIResponse('A IA devolveu um JSON inválido');
    }
  }
}

function validateQuery(v: unknown): QuerySpec | null {
  if (!v || typeof v !== 'object') return null;
  const q = v as Record<string, unknown>;
  return {
    metric: oneOf(q.metric, METRICS) ?? 'total',
    transaction_type: txType(q.transaction_type),
    period: oneOf(q.period, PERIODS) ?? 'this_month',
    start_date: isValidISODate(q.start_date) ? q.start_date : null,
    end_date: isValidISODate(q.end_date) ? q.end_date : null,
    category: str(q.category, 40),
    search: str(q.search, 60),
  };
}

export function validateInterpretation(data: unknown): Interpretation {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new InvalidAIResponse('Resposta da IA não é um objeto');
  }
  const d = data as Record<string, unknown>;
  const isTx = d.is_transaction === true;

  let intent = oneOf(d.intent, INTENTS);
  if (!intent) intent = isTx ? 'new_transaction' : d.query ? 'query' : 'other';

  const confidence = typeof d.confidence === 'number' && Number.isFinite(d.confidence) ? Math.min(1, Math.max(0, d.confidence)) : 0.5;

  const query = intent === 'query' ? validateQuery(d.query) : null;
  if (intent === 'query' && !query) throw new InvalidAIResponse('Consulta sem parâmetros');

  return {
    intent,
    is_transaction: isTx || intent === 'new_transaction' || intent === 'update_pending',
    transaction_type: txType(d.transaction_type),
    amount: normalizeAmount(d.amount),
    currency: typeof d.currency === 'string' && /^[A-Z]{3}$/.test(d.currency) ? d.currency : null,
    category: str(d.category, 40),
    description: str(d.description, 80),
    date: isValidISODate(d.date) ? d.date : null,
    confidence,
    needs_confirmation: d.needs_confirmation !== false,
    clarification_question: str(d.clarification_question, 200),
    query,
    reply: str(d.reply, 400),
    transcript: str(d.transcript, 500),
  };
}
