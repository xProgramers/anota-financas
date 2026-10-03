// Interpretador local, determinístico, usado quando a IA não está configurada,
// estourou o limite gratuito ou falhou. Cobre os formatos mais comuns.
import { findKeyword, matchCategory, norm } from './categories.js';
import { addDays, isValidISODate, weekdayOf } from './dates.js';
import { parseBRNumber } from './money.js';
import type { InterpretContext, Interpretation, QueryMetric, QueryPeriod, TxType } from './types.js';

const WEEKDAYS: Record<string, number> = {
  domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6,
};

const STOPWORDS = new Set(
  (
    'gastei gasto gastos gastar paguei pago pagar paguei comprei compra comprar recebi receber recebido entrou ganhei ' +
    'hoje ontem anteontem no na nos nas num numa de do da dos das em com um uma uns umas por pra para pro o a os as ' +
    'reais real r$ rs conto contos pila mais foi foram meu minha meus minhas e que eu ir dia semana passada passado ' +
    'mes ultimo ultima segunda terca quarta quinta sexta sabado domingo feira mil k ai la so tipo uns cerca de'
  ).split(' '),
);

const INCOME_RE = /\b(recebi|receber|recebido|recebemos|entrou|entraram|ganhei|caiu|depositaram|salario|freela|freelance|vendi|rendimentos?|dividendos?)\b/;
const SPEND_RE = /\b(gastei|gasto|paguei|comprei|torrei|pagar|paguei)\b/;
const CORRECTION_RE = /^(nao|na verdade|corrig|era\b|foi\b|foram\b|muda|altera|troca|coloca|categoria|e\s|eh\s)/;
const QUERY_START_RE = /^(quanto|quantos|quantas|qual|quais|onde|me (mostra|diz|fala)|mostra|resumo|meu saldo|saldo)/;

interface Extracted<T> {
  value: T;
  rest: string;
}

/** Extrai uma data relativa ou explícita do texto normalizado. */
export function extractDate(n: string, today: string): Extracted<string | null> {
  const weekday = weekdayOf(today);
  const tests: Array<[RegExp, (m: RegExpMatchArray) => string | null]> = [
    [/\banteontem\b/, () => addDays(today, -2)],
    [/\bontem\b/, () => addDays(today, -1)],
    [/\bhoje\b/, () => today],
    [
      /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/,
      (m) => {
        const d = Number(m[1]);
        const mo = Number(m[2]);
        let y = m[3] ? Number(m[3]) : Number(today.slice(0, 4));
        if (y < 100) y += 2000;
        let iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (!isValidISODate(iso)) return null;
        if (!m[3] && iso > today) iso = `${y - 1}${iso.slice(4)}`;
        return isValidISODate(iso) ? iso : null;
      },
    ],
    [
      /\bdia (\d{1,2})\b/,
      (m) => {
        const d = String(Number(m[1])).padStart(2, '0');
        let iso = `${today.slice(0, 8)}${d}`;
        if (!isValidISODate(iso) || iso > today) {
          // dia ainda não chegou neste mês → mês anterior
          const prev = addDays(today.slice(0, 8) + '01', -1);
          iso = `${prev.slice(0, 8)}${d}`;
        }
        return isValidISODate(iso) ? iso : null;
      },
    ],
    [
      /\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:[- ]feira)?( passad[oa])?\b/,
      (m) => {
        const target = WEEKDAYS[m[1]];
        let diff = (weekday - target + 7) % 7;
        if (diff === 0 && m[2]) diff = 7;
        return addDays(today, -diff);
      },
    ],
    [/\bsemana passada\b/, () => addDays(today, -7)],
  ];

  for (const [re, fn] of tests) {
    const m = n.match(re);
    if (m) {
      const value = fn(m);
      if (value) return { value, rest: n.replace(m[0], ' ') };
    }
  }
  return { value: null, rest: n };
}

const MONEY_RE =
  /(r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(\s*(?:mil|k)\b)?(\s*(?:reais|real|conto|contos|pila|r\$))?/g;

/** Extrai o valor monetário mais provável do texto normalizado. */
export function extractAmount(n: string): Extracted<number | null> {
  let best: { value: number; score: number; match: string } | null = null;
  for (const m of n.matchAll(MONEY_RE)) {
    const idx = m.index ?? 0;
    const next = n.charAt(idx + m[0].length);
    const prev = n.charAt(idx - 1);
    if (/[a-z0-9]/.test(prev) && !m[1]) continue; // parte de uma palavra (ex.: "99pop")
    if (!m[3] && !m[4] && /[xh%:º°]/.test(next)) continue; // "3x", "19h", "10%"
    let value = parseBRNumber(m[2]);
    if (value === null) continue;
    if (m[3]) value *= 1000;
    const score = (m[1] ? 2 : 0) + (m[4] ? 2 : 0) + (m[3] ? 1 : 0);
    if (!best || score > best.score) best = { value, score, match: m[0] };
  }
  if (!best || best.value <= 0) return { value: null, rest: n };
  return { value: Math.round(best.value * 100) / 100, rest: n.replace(best.match, ' ') };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Descrição curta: palavras do texto original que não são valor, data ou conectivo. */
function buildDescription(original: string, keyword: string | null): string | null {
  const tokens = original.split(/\s+/).map((t) => t.replace(/^[^\p{L}\p{N}$]+|[^\p{L}\p{N}]+$/gu, '')).filter(Boolean);
  if (keyword && !keyword.includes(' ')) {
    const tok = tokens.find((t) => norm(t) === keyword);
    if (tok) return capitalize(tok);
  }
  const kept = tokens.filter((t) => {
    const nt = norm(t);
    if (STOPWORDS.has(nt)) return false;
    if (/\d/.test(nt)) return false;
    if (/-feira$/.test(nt)) return false;
    return nt.length > 1;
  });
  if (!kept.length) return null;
  return capitalize(kept.slice(0, 5).join(' ')).slice(0, 80);
}

/** Procura no texto o nome (ou apelido) de uma categoria do usuário. */
function mentionedCategory(n: string, ctx: InterpretContext, type?: TxType) {
  const cats = type ? ctx.categories.filter((c) => c.type === type) : ctx.categories;
  for (const c of cats) {
    const cn = norm(c.name);
    if (cn === 'outros') continue;
    if (new RegExp(`(^|\\s)${cn}($|\\s|[?.!,])`).test(n)) return c;
  }
  return null;
}

function interpretQuery(n: string, ctx: InterpretContext): Interpretation {
  let metric: QueryMetric = 'total';
  if (/maior categoria|categoria (que )?(eu )?mais|onde (eu )?mais gast|com o que (eu )?mais gast/.test(n)) metric = 'top_category';
  else if (/\b(saldo|sobrou|balanco)\b/.test(n)) metric = 'balance';
  else if (/\bquant[ao]s (vezes|transac|compras|registros|lancamentos|gastos)/.test(n)) metric = 'count';

  const type: TxType | null = metric === 'balance' ? null : /\b(recebi|ganhei|receitas?|entrou|entradas|faturei)\b/.test(n) ? 'income' : 'expense';

  let period: QueryPeriod = 'this_month';
  if (/\bhoje\b/.test(n)) period = 'today';
  else if (/\bontem\b/.test(n)) period = 'yesterday';
  else if (/semana passada/.test(n)) period = 'last_week';
  else if (/(essa|esta|nessa|nesta) semana/.test(n)) period = 'this_week';
  else if (/mes passado/.test(n)) period = 'last_month';
  else if (/ultimos 7 dias/.test(n)) period = 'last_7_days';
  else if (/ultimos 30 dias/.test(n)) period = 'last_30_days';
  else if (/(esse|este|neste|nesse) ano/.test(n)) period = 'this_year';

  let category: string | null = null;
  let search: string | null = null;
  if (metric !== 'top_category' && metric !== 'balance') {
    const cat = mentionedCategory(n, ctx, type ?? undefined);
    if (cat) category = cat.name;
    else {
      const m = n.match(/\b(?:com|no|na|de|em)\s+([a-z0-9]+)/);
      const qStop = new Set(['gasto', 'gastos', 'despesa', 'despesas', 'receita', 'receitas', 'mes', 'ano', 'semana', 'hoje', 'ontem', 'esse', 'este', 'essa', 'esta', 'isso', 'tudo', 'total', 'minha', 'meu', 'dinheiro']);
      if (m && !qStop.has(m[1])) {
        const viaAlias = matchCategory(m[1], type ?? 'expense', ctx.categories);
        if (viaAlias && norm(viaAlias.name) !== 'outros') category = viaAlias.name;
        else search = m[1];
      }
    }
  }

  return {
    ...emptyInterpretation('query'),
    confidence: 0.7,
    query: { metric, transaction_type: type, period, start_date: null, end_date: null, category, search },
  };
}

export function emptyInterpretation(intent: Interpretation['intent']): Interpretation {
  return {
    intent,
    is_transaction: false,
    transaction_type: null,
    amount: null,
    currency: null,
    category: null,
    description: null,
    date: null,
    confidence: 0.5,
    needs_confirmation: false,
    clarification_question: null,
    query: null,
    reply: null,
    transcript: null,
  };
}

export function heuristicInterpret(ctx: InterpretContext): Interpretation {
  const original = ctx.text.trim();
  const n = norm(original).replace(/\s+/g, ' ');

  if (QUERY_START_RE.test(n) || (n.endsWith('?') && /(gast|receb|ganhei|saldo|categoria)/.test(n))) {
    return interpretQuery(n, ctx);
  }

  const date = extractDate(n, ctx.today);
  const amount = extractAmount(date.rest);
  const isIncome = INCOME_RE.test(n);
  const type: TxType = isIncome ? 'income' : 'expense';
  const kw = findKeyword(amount.rest, isIncome ? 'income' : undefined);
  const kwType = kw?.type ?? type;
  const catMention = mentionedCategory(n, ctx);

  // Correção de um rascunho pendente ("foi ontem", "na verdade foram 58", "é lazer")
  if (ctx.pending) {
    const looksLikeCorrection =
      CORRECTION_RE.test(n) || (!kw && !SPEND_RE.test(n) && !isIncome && (amount.value !== null || date.value !== null || catMention !== null));
    if (looksLikeCorrection && (amount.value !== null || date.value !== null || catMention)) {
      return {
        ...emptyInterpretation('update_pending'),
        is_transaction: true,
        transaction_type: catMention ? catMention.type : null,
        amount: amount.value,
        date: date.value,
        category: catMention?.name ?? null,
        confidence: 0.75,
        needs_confirmation: true,
      };
    }
  }

  const description = buildDescription(original, kw?.word ?? null);
  const hasSignal = amount.value !== null || kw !== null || SPEND_RE.test(n) || isIncome;

  if (amount.value === null && !SPEND_RE.test(n) && !isIncome && /\b(fui|estive|passei)\b/.test(n) && description) {
    return {
      ...emptyInterpretation('new_transaction'),
      is_transaction: true,
      transaction_type: 'expense',
      description,
      category: kw?.category ?? null,
      confidence: 0.4,
      needs_confirmation: true,
      clarification_question: `Entendi que você foi ${/shopping/.test(n) ? 'ao shopping' : 'a ' + description.toLowerCase()}, mas não encontrei um valor para registrar. Quanto você gastou?`,
    };
  }

  if (!hasSignal) {
    return {
      ...emptyInterpretation('other'),
      confidence: 0.6,
      reply: 'Não identifiquei um gasto ou uma receita nessa mensagem. Tente algo como "Gastei 25 no almoço" ou pergunte "Quanto gastei este mês?".',
    };
  }

  let category = kw?.category ?? catMention?.name ?? null;
  let finalDescription = description;
  if (kwType === 'income' && !category) category = 'Outros';
  if (kwType === 'income' && !finalDescription) finalDescription = 'Recebimento';
  if (!category && finalDescription) category = 'Outros';

  let clarification: string | null = null;
  if (amount.value === null) {
    const d = finalDescription ? finalDescription.toLowerCase() : null;
    clarification =
      kwType === 'income'
        ? 'Qual foi o valor recebido?'
        : d
          ? `Claro. Quanto você gastou ${kw ? 'no ' : 'com '}${d}?`
          : 'Quanto você gastou?';
  } else if (!finalDescription) {
    clarification = `O que você pagou com esses R$ ${amount.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}?`;
  }

  return {
    ...emptyInterpretation('new_transaction'),
    is_transaction: true,
    transaction_type: kwType,
    amount: amount.value,
    currency: 'BRL',
    category: clarification && !finalDescription ? null : category,
    description: finalDescription,
    date: date.value ?? ctx.today,
    confidence: kw ? 0.85 : 0.65,
    needs_confirmation: true,
    clarification_question: clarification,
  };
}
