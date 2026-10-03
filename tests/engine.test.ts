// Testes da camada de interpretação (sem rede). Rode: npm run test:engine
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { interpret, finalize } from '../api/_lib/engine.js';
import { parseBRNumber } from '../api/_lib/money.js';
import { validateInterpretation } from '../api/_lib/validate.js';
import type { CategoryRef, Draft, InterpretContext } from '../api/_lib/types.js';

const names: Array<[string, 'expense' | 'income']> = [
  ['Alimentação', 'expense'], ['Transporte', 'expense'], ['Moradia', 'expense'], ['Contas', 'expense'],
  ['Compras pessoais', 'expense'], ['Saúde', 'expense'], ['Lazer', 'expense'], ['Educação', 'expense'],
  ['Assinaturas', 'expense'], ['Viagens', 'expense'], ['Outros', 'expense'],
  ['Salário', 'income'], ['Freelance', 'income'], ['Investimentos', 'income'], ['Vendas', 'income'], ['Outros', 'income'],
];
const categories: CategoryRef[] = names.map(([name, type], i) => ({ id: `c${i}`, name, type }));
const TODAY = '2026-10-02'; // sexta-feira

const ctx = (text: string, pending: Draft | null = null): InterpretContext => ({ text, today: TODAY, weekday: 5, categories, pending });
const run = async (text: string, pending: Draft | null = null) => (await interpret(ctx(text, pending), null)).result;

async function draftOf(text: string, pending: Draft | null = null) {
  const r = await run(text, pending);
  assert.equal(r.kind, 'draft', `"${text}" deveria gerar rascunho, gerou ${JSON.stringify(r)}`);
  return (r as Extract<typeof r, { kind: 'draft' }>).draft;
}

test('valores brasileiros', () => {
  assert.equal(parseBRNumber('10'), 10);
  assert.equal(parseBRNumber('10,50'), 10.5);
  assert.equal(parseBRNumber('10.50'), 10.5);
  assert.equal(parseBRNumber('1.250,90'), 1250.9);
  assert.equal(parseBRNumber('4.500'), 4500);
  assert.equal(parseBRNumber('1.250.000'), 1250000);
});

test('Teste 1 — Gastei R$ 35 no almoço', async () => {
  const d = await draftOf('Gastei R$ 35 no almoço');
  assert.deepEqual([d.transaction_type, d.amount, d.category_name, d.description, d.date], ['expense', 35, 'Alimentação', 'Almoço', TODAY]);
  assert.equal(d.clarification_question, null);
});

test('Teste 2 — Uber 18,50', async () => {
  const d = await draftOf('Uber 18,50');
  assert.deepEqual([d.transaction_type, d.amount, d.category_name, d.description, d.date], ['expense', 18.5, 'Transporte', 'Uber', TODAY]);
});

test('Teste 3 — salário', async () => {
  const d = await draftOf('Recebi meu salário de R$ 4.500');
  assert.deepEqual([d.transaction_type, d.amount, d.category_name], ['income', 4500, 'Salário']);
});

test('Teste 4 — cinema ontem', async () => {
  const d = await draftOf('Gastei 70 ontem no cinema');
  assert.deepEqual([d.amount, d.category_name, d.description, d.date], [70, 'Lazer', 'Cinema', '2026-10-01']);
});

test('Teste 5 — sem valor pede valor', async () => {
  const d = await draftOf('Gastei no mercado');
  assert.equal(d.amount, null);
  assert.match(d.clarification_question ?? '', /quanto/i);
});

test('Teste 6 — consulta do mês', async () => {
  const r = await run('Quanto gastei esse mês?');
  assert.equal(r.kind, 'query');
  if (r.kind === 'query') {
    assert.deepEqual([r.query.metric, r.query.transaction_type, r.query.start, r.query.end], ['total', 'expense', '2026-10-01', TODAY]);
  }
});

test('variações de escrita', async () => {
  for (const t of ['gastei 30 no almoço', 'almoço 30 reais', 'hoje paguei 30 no almoço', '30 almoço', 'R$ 30,00 almoço']) {
    const d = await draftOf(t);
    assert.equal(d.amount, 30, t);
    assert.equal(d.category_name, 'Alimentação', t);
  }
  for (const t of ['Uber 22', 'gastei 22 de uber', 'paguei 22 reais no uber']) {
    const d = await draftOf(t);
    assert.equal(d.amount, 22, t);
    assert.equal(d.category_name, 'Transporte', t);
  }
  const camiseta = await draftOf('Comprei uma camiseta por 79,90');
  assert.deepEqual([camiseta.amount, camiseta.category_name, camiseta.description], [79.9, 'Compras pessoais', 'Camiseta']);
});

test('datas relativas', async () => {
  assert.equal((await draftOf('anteontem 20 no mercado')).date, '2026-09-30');
  assert.equal((await draftOf('segunda 15 no uber')).date, '2026-09-28');
  assert.equal((await draftOf('sexta passada 15 no uber')).date, '2026-09-25');
  assert.equal((await draftOf('dia 15 paguei 100 de luz')).date, '2026-09-15');
  assert.equal((await draftOf('dia 1 paguei 100 de luz')).date, '2026-10-01');
  assert.equal((await draftOf('25/09 farmácia 42,10')).date, '2026-09-25');
});

test('receitas', async () => {
  assert.equal((await draftOf('Entrou 500 de freelance')).category_name, 'Freelance');
  const r = await draftOf('Recebi 200 reais');
  assert.deepEqual([r.transaction_type, r.amount, r.category_name], ['income', 200, 'Outros']);
});

test('pedidos de esclarecimento', async () => {
  const shop = await run('fui no shopping');
  assert.equal(shop.kind, 'draft');
  if (shop.kind === 'draft') assert.match(shop.draft.clarification_question!, /shopping.*Quanto/);
  const valor = await draftOf('R$ 35');
  assert.match(valor.clarification_question!, /O que você pagou com esses R\$\s?35/);
  assert.equal((await run('bom dia')).kind, 'message');
});

test('correções do rascunho pendente', async () => {
  const pending = await draftOf('gastei 50 no restaurante');
  const ontem = await draftOf('foi ontem', pending);
  assert.deepEqual([ontem.amount, ontem.date, ontem.category_name], [50, '2026-10-01', 'Alimentação']);
  const valor = await draftOf('na verdade foram 58', ontem);
  assert.deepEqual([valor.amount, valor.date], [58, '2026-10-01']);
  const nao = await draftOf('não, foi 45', pending);
  assert.equal(nao.amount, 45);
  const semValor = await draftOf('Gastei no mercado');
  const completo = await draftOf('40', semValor);
  assert.deepEqual([completo.amount, completo.category_name, completo.clarification_question], [40, 'Alimentação', null]);
  assert.equal((await run('sim', pending)).kind, 'confirm');
  assert.equal((await run('cancela', pending)).kind, 'cancel');
});

test('consultas', async () => {
  const comida = await run('Quanto gastei com comida?');
  assert.ok(comida.kind === 'query' && comida.query.category_name === 'Alimentação');
  const uber = await run('Quanto gastei com Uber esse mês?');
  assert.ok(uber.kind === 'query' && uber.query.search === 'uber' && uber.query.category_id === null);
  const ontem = await run('Quanto gastei ontem?');
  assert.ok(ontem.kind === 'query' && ontem.query.start === '2026-10-01' && ontem.query.end === '2026-10-01');
  const top = await run('Qual minha maior categoria de gasto?');
  assert.ok(top.kind === 'query' && top.query.metric === 'top_category');
});

test('validação de resposta da IA', () => {
  assert.throws(() => validateInterpretation('texto'));
  const v = validateInterpretation({ is_transaction: true, amount: '1.250,90', category: 'food', date: '2026-13-40', confidence: 7 });
  assert.equal(v.intent, 'new_transaction');
  assert.equal(v.amount, 1250.9);
  assert.equal(v.date, null);
  assert.equal(v.confidence, 1);
  const d = finalize(v, ctx('x'));
  assert.ok(d.kind === 'draft' && d.draft.category_name === 'Alimentação' && d.draft.date === TODAY);
  const neg = validateInterpretation({ is_transaction: true, amount: -5, confidence: 0.9 });
  assert.equal(neg.amount, null);
});

test('IA com JSON inválido cai no interpretador local', async () => {
  const out = await interpret(ctx('Uber 22'), async () => ({ raw: 'desculpe, não sei', provider: 'fake' }));
  assert.equal(out.provider, 'local');
  assert.ok(out.result.kind === 'draft' && out.result.draft.amount === 22);
});
