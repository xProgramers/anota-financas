// Orquestra a interpretação: atalhos determinísticos → IA → validação → resultado.
import { matchCategory, norm } from './categories.js';
import { addDays, daysBetween, isValidISODate, periodRange, formatBRDate } from './dates.js';
import { heuristicInterpret } from './heuristic.js';
import { formatBRL } from './money.js';
import { parseJSONLoose, validateInterpretation } from './validate.js';
import type { Draft, EngineResult, ImageInput, InterpretContext, Interpretation, ResolvedQuery } from './types.js';

const CONFIRM_RE = /^(sim|s|ok|okay|isso|isso mesmo|certo|confirm[ao]r?|confirmado|pode (salvar|registrar|confirmar)|salva|salvar|registra|registrar|beleza|blz|perfeito|correto|exato)[.!\s]*$/;
const CANCEL_RE = /^(nao registra|cancela|cancelar|cancele|descarta|descartar|esquece|esqueca|deixa pra la|apaga( isso)?|nao salva)[.!\s]*$/;

export type Provider = (ctx: InterpretContext, image?: ImageInput) => Promise<{ raw: string; provider: string }>;

export interface EngineOutput {
  result: EngineResult;
  interpretation: Interpretation | null;
  raw: string | null;
  provider: string;
  error?: string;
}

/** Atalhos que não precisam de IA (economizam cota e respondem na hora). */
export function shortcut(ctx: InterpretContext): EngineResult | null {
  if (!ctx.pending) return null;
  const n = norm(ctx.text).replace(/\s+/g, ' ');
  if (CONFIRM_RE.test(n)) return { kind: 'confirm' };
  if (CANCEL_RE.test(n)) return { kind: 'cancel' };
  return null;
}

function defaultClarification(d: Draft): string | null {
  if (d.amount === null) {
    if (d.transaction_type === 'income') return 'Qual foi o valor recebido?';
    return d.description ? `Quanto você gastou com ${d.description.toLowerCase()}?` : 'Quanto você gastou?';
  }
  if (!d.category_id && !d.description) {
    return d.transaction_type === 'income'
      ? `De onde veio esse valor de ${formatBRL(d.amount)}?`
      : `O que você pagou com esses ${formatBRL(d.amount)}?`;
  }
  return null;
}

function clampDate(date: string | null, today: string): string {
  if (!date || !isValidISODate(date)) return today;
  // Datas muito no futuro costumam ser erro de interpretação.
  if (daysBetween(today, date) > 31) return today;
  if (daysBetween(date, today) > 366 * 5) return today;
  return date;
}

function resolveQuery(i: Interpretation, ctx: InterpretContext): ResolvedQuery {
  const q = i.query!;
  let { start, end, label } = periodRange(q.period, ctx.today);
  if (q.period === 'custom' && q.start_date && q.end_date) {
    start = q.start_date <= q.end_date ? q.start_date : q.end_date;
    end = q.start_date <= q.end_date ? q.end_date : q.start_date;
    label = start === end ? `em ${formatBRDate(start)}` : `de ${formatBRDate(start)} a ${formatBRDate(end)}`;
  }
  const type = q.metric === 'balance' || q.metric === 'top_category' ? (q.metric === 'top_category' ? 'expense' : null) : (q.transaction_type ?? 'expense');

  let category_id: string | null = null;
  let category_name: string | null = null;
  if (q.category && type) {
    const cat = matchCategory(q.category, type, ctx.categories);
    // Só aceita se não caiu no "Outros" por falta de correspondência.
    if (cat && (norm(cat.name) !== 'outros' || norm(q.category) === 'outros')) {
      category_id = cat.id;
      category_name = cat.name;
    }
  }

  return {
    metric: q.metric,
    transaction_type: type,
    start,
    end,
    category_id,
    category_name,
    search: category_id ? null : q.search,
    label,
  };
}

/** Converte a interpretação validada em uma ação concreta. */
export function finalize(i: Interpretation, ctx: InterpretContext): EngineResult {
  switch (i.intent) {
    case 'confirm_pending':
      return ctx.pending ? { kind: 'confirm' } : { kind: 'message', text: 'Não há nenhum registro aguardando confirmação.' };
    case 'cancel_pending':
      return ctx.pending ? { kind: 'cancel' } : { kind: 'message', text: 'Não há nenhum registro pendente para cancelar.' };
    case 'query':
      return { kind: 'query', query: resolveQuery(i, ctx) };
    case 'other':
      return {
        kind: 'message',
        text:
          i.reply ??
          'Não identifiquei um gasto ou uma receita nessa mensagem. Tente algo como "Gastei 25 no almoço" ou pergunte "Quanto gastei este mês?".',
      };
  }

  // Transação nova ou correção da pendente.
  const p = i.intent === 'update_pending' ? ctx.pending : null;

  if (!p && i.amount === null && !i.description && !i.category) {
    return { kind: 'message', text: i.clarification_question ?? 'Não encontrei um valor para registrar. Quanto foi?' };
  }

  const type = i.transaction_type ?? p?.transaction_type ?? 'expense';
  const amount = i.amount ?? p?.amount ?? null;
  const description = i.description ?? p?.description ?? null;
  const date = i.date ? clampDate(i.date, ctx.today) : (p?.date ?? clampDate(null, ctx.today));

  let category_id: string | null = null;
  let category_name: string | null = null;
  if (i.category) {
    const cat = matchCategory(i.category, type, ctx.categories);
    if (cat) ({ id: category_id, name: category_name } = cat);
  } else if (p && p.transaction_type === type && p.category_id) {
    category_id = p.category_id;
    category_name = p.category_name;
  } else if (description) {
    const cat = matchCategory('Outros', type, ctx.categories);
    if (cat) ({ id: category_id, name: category_name } = cat);
  }

  const draft: Draft = {
    transaction_type: type,
    amount,
    category_id,
    category_name,
    description,
    date,
    confidence: i.confidence,
    clarification_question: null,
  };
  // A pergunta da IA só vale se ainda faltar algo; senão recalculamos.
  const missing = defaultClarification(draft);
  draft.clarification_question = missing ? (i.clarification_question ?? missing) : null;

  return { kind: 'draft', draft, replaces_pending: Boolean(p) };
}

export async function interpret(ctx: InterpretContext, provider: Provider | null, image?: ImageInput): Promise<EngineOutput> {
  if (image) return interpretImage(ctx, provider, image);

  const quick = shortcut(ctx);
  if (quick) return { result: quick, interpretation: null, raw: null, provider: 'rules' };

  let error: string | undefined;
  if (provider) {
    try {
      const out = await provider(ctx);
      const interpretation = validateInterpretation(parseJSONLoose(out.raw));
      return { result: finalize(interpretation, ctx), interpretation, raw: out.raw, provider: out.provider, error };
    } catch (err) {
      // JSON inválido, cota estourada, timeout… → interpretador local.
      error = err instanceof Error ? err.message : String(err);
    }
  }

  const interpretation = heuristicInterpret(ctx);
  return {
    result: finalize(interpretation, ctx),
    interpretation,
    raw: JSON.stringify(interpretation),
    provider: 'local',
    error,
  };
}

/**
 * Foto de nota/cupom fiscal: só a IA com visão consegue ler.
 * Não há fallback local; a imagem não sai desta função (não é salva nem registrada).
 */
async function interpretImage(ctx: InterpretContext, provider: Provider | null, image: ImageInput): Promise<EngineOutput> {
  if (!provider) {
    return {
      result: { kind: 'message', text: 'A leitura de fotos precisa da IA configurada. Por enquanto, digite o valor e o local da compra.' },
      interpretation: null,
      raw: null,
      provider: 'none',
    };
  }
  // Foto sempre gera um registro novo, nunca corrige o pendente.
  const photoCtx: InterpretContext = { ...ctx, pending: null };
  try {
    const out = await provider(photoCtx, image);
    const interpretation = validateInterpretation(parseJSONLoose(out.raw));
    if (interpretation.intent === 'new_transaction' || interpretation.intent === 'update_pending') {
      interpretation.intent = 'new_transaction';
      // Sem valor legível não há o que registrar a partir da foto.
      if (interpretation.amount === null) {
        return {
          result: {
            kind: 'message',
            text: interpretation.clarification_question ?? 'Não consegui ler o valor total nessa foto. Tente outra foto mais nítida ou digite o valor.',
          },
          interpretation,
          raw: out.raw,
          provider: out.provider,
        };
      }
    } else if (interpretation.intent !== 'other') {
      interpretation.intent = 'other';
    }
    return { result: finalize(interpretation, photoCtx), interpretation, raw: out.raw, provider: out.provider };
  } catch (err) {
    return {
      result: { kind: 'message', text: 'Não consegui ler essa foto agora. Tente de novo com mais luz e o cupom inteiro no quadro, ou digite o valor.' },
      interpretation: null,
      raw: null,
      provider: 'gemini',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Texto curto que resume o rascunho (vira o conteúdo da mensagem do assistente). */
export function describeDraft(d: Draft, updated: boolean, today: string): string {
  if (d.clarification_question) return d.clarification_question;
  const kind = d.transaction_type === 'income' ? 'receita' : 'despesa';
  const when =
    d.date === today ? ' hoje' : d.date === addDays(today, -1) ? ' ontem' : ` em ${formatBRDate(d.date)}`;
  const head = updated ? 'Atualizei' : 'Entendi';
  return `${head}: ${kind} de ${formatBRL(d.amount ?? 0)} — ${d.description ?? d.category_name ?? 'sem descrição'} (${d.category_name ?? 'sem categoria'})${when}. Confirmar?`;
}
