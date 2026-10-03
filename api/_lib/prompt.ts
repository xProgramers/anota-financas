// Prompt e schema de saída enviados ao modelo.
import type { InterpretContext } from './types.js';

const WEEKDAY_NAMES = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

export function buildSystemPrompt(ctx: InterpretContext): string {
  const expense = ctx.categories.filter((c) => c.type === 'expense').map((c) => c.name);
  const income = ctx.categories.filter((c) => c.type === 'income').map((c) => c.name);

  return `Você interpreta mensagens curtas de um app brasileiro de controle financeiro pessoal.
Responda SOMENTE com JSON no schema fornecido. Nunca invente valores, datas ou números.

Hoje é ${ctx.today} (${WEEKDAY_NAMES[ctx.weekday]}). Moeda padrão: BRL.

Categorias de DESPESA: ${expense.join(', ')}
Categorias de RECEITA: ${income.join(', ')}
Use exatamente um desses nomes em "category". Se nada se encaixar, use "Outros".

Escolha "intent":
- new_transaction: a mensagem descreve um gasto ou um recebimento novo.
- update_pending: existe um registro pendente e a mensagem corrige ou completa esse registro
  (ex.: "foi ontem", "na verdade foram 58", "é lazer", ou só um valor respondendo à pergunta feita).
  Preencha SOMENTE os campos que mudam; deixe os outros null.
- confirm_pending: confirma o registro pendente ("sim", "ok", "pode salvar").
- cancel_pending: descarta o registro pendente ("cancela", "esquece").
- query: pergunta sobre os próprios gastos/receitas. Preencha "query"; NÃO calcule nada.
- other: qualquer outra coisa. Escreva em "reply" uma resposta curta em português, sem números inventados.

Regras de interpretação:
- Valores no formato brasileiro: "1.250,90" = 1250.90; "4.500" = 4500; "10,50" e "10.50" = 10.5; "2 mil" = 2000.
  "amount" é um número positivo, sem sinal.
- receita (income): recebi, entrou, ganhei, salário, vendi, freela. Caso contrário, despesa (expense).
- Datas relativas a partir de hoje: hoje, ontem, anteontem, dia 15 (mês atual; se ainda não chegou, mês anterior),
  "segunda"/"sexta passada" (a ocorrência passada mais recente), "semana passada" (7 dias atrás). Formato YYYY-MM-DD.
  Sem data mencionada em new_transaction → hoje.
- "description": curta, 1 a 4 palavras, com inicial maiúscula (ex.: "Almoço", "Uber para trabalho", "Camiseta").
- Mercado/supermercado/restaurante/delivery → Alimentação. Uber/99/ônibus/gasolina → Transporte.
  Netflix/Spotify → Assinaturas. Farmácia/médico/academia → Saúde. Roupas → Compras pessoais.
- Se faltar o valor, deixe amount null e escreva "clarification_question" (ex.: "Quanto você gastou no almoço?").
  Se houver valor mas não for possível saber com o quê, pergunte: "O que você pagou com esses R$ 35?".
  Se a pessoa só disse onde foi, sem valor (ex.: "fui no shopping"), não invente despesa: pergunte quanto gastou.
- "confidence" de 0 a 1. "needs_confirmation" é sempre true para transações.

Para "query":
- metric: total (soma), count (quantidade), balance (receitas − despesas), top_category (maior categoria de gasto).
- transaction_type: expense para "gastei", income para "recebi"; null para balance.
- period: today, yesterday, this_week, last_week, this_month, last_month, this_year, last_7_days, last_30_days,
  ou custom com start_date/end_date. Sem período mencionado → this_month.
- category: um nome da lista quando a pergunta for sobre uma categoria ("com comida" → Alimentação).
- search: termo específico que não é categoria ("com Uber" → "Uber"), senão null.`;
}

export function buildUserPrompt(ctx: InterpretContext): string {
  const pending = ctx.pending
    ? `Registro pendente (aguardando confirmação): ${JSON.stringify({
        transaction_type: ctx.pending.transaction_type,
        amount: ctx.pending.amount,
        category: ctx.pending.category_name,
        description: ctx.pending.description,
        date: ctx.pending.date,
        pergunta_feita: ctx.pending.clarification_question,
      })}`
    : 'Nenhum registro pendente.';
  return `${pending}\n\nMensagem do usuário:\n"""${ctx.text}"""`;
}

/** Schema no formato OpenAPI aceito pelo Gemini (responseSchema). */
export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    intent: {
      type: 'STRING',
      enum: ['new_transaction', 'update_pending', 'confirm_pending', 'cancel_pending', 'query', 'other'],
    },
    is_transaction: { type: 'BOOLEAN' },
    transaction_type: { type: 'STRING', enum: ['expense', 'income'], nullable: true },
    amount: { type: 'NUMBER', nullable: true },
    currency: { type: 'STRING', nullable: true },
    category: { type: 'STRING', nullable: true },
    description: { type: 'STRING', nullable: true },
    date: { type: 'STRING', nullable: true },
    confidence: { type: 'NUMBER' },
    needs_confirmation: { type: 'BOOLEAN' },
    clarification_question: { type: 'STRING', nullable: true },
    reply: { type: 'STRING', nullable: true },
    query: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        metric: { type: 'STRING', enum: ['total', 'count', 'balance', 'top_category'] },
        transaction_type: { type: 'STRING', enum: ['expense', 'income'], nullable: true },
        period: {
          type: 'STRING',
          enum: ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'this_year', 'last_7_days', 'last_30_days', 'custom'],
        },
        start_date: { type: 'STRING', nullable: true },
        end_date: { type: 'STRING', nullable: true },
        category: { type: 'STRING', nullable: true },
        search: { type: 'STRING', nullable: true },
      },
      required: ['metric', 'period'],
    },
  },
  required: ['intent', 'is_transaction', 'confidence', 'needs_confirmation'],
} as const;
