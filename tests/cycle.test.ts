// Testes do ciclo da fatura do cartão (sem rede).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { billClosingIn, billForDate, billLabel, billStatus, shiftBill } from '../src/features/cards/cycle.js';

const nubank = { closing_day: 3, due_day: 10 };

test('compra até o fechamento entra na fatura do mês; depois, na seguinte', () => {
  assert.deepEqual(billForDate(nubank, '2026-11-03'), { start: '2026-10-04', end: '2026-11-03', due: '2026-11-10', closingMonth: '2026-11' });
  assert.equal(billForDate(nubank, '2026-11-04').end, '2026-12-03');
  assert.equal(billForDate(nubank, '2026-11-04').due, '2026-12-10');
});

test('vencimento antes do fechamento cai no mês seguinte', () => {
  const card = { closing_day: 25, due_day: 5 };
  const bill = billForDate(card, '2026-12-20');
  assert.equal(bill.end, '2026-12-25');
  assert.equal(bill.due, '2027-01-05');
  assert.equal(billLabel(bill, '2026-12-20'), 'Fatura de janeiro de 2027');
});

test('dia 31 vira o último dia em meses curtos', () => {
  const card = { closing_day: 31, due_day: 8 };
  const feb = billClosingIn(card, '2026-02');
  assert.equal(feb.start, '2026-02-01');
  assert.equal(feb.end, '2026-02-28');
  const mar = billClosingIn(card, '2026-03');
  assert.equal(mar.start, '2026-03-01');
  assert.equal(mar.end, '2026-03-31');
});

test('faturas seguidas não deixam buracos nem sobreposição', () => {
  for (const card of [nubank, { closing_day: 31, due_day: 10 }, { closing_day: 29, due_day: 7 }, { closing_day: 15, due_day: 22 }]) {
    let bill = billClosingIn(card, '2025-12');
    for (let i = 0; i < 26; i++) {
      const next = shiftBill(card, bill, 1);
      const after = new Date(Date.parse(bill.end) + 86_400_000).toISOString().slice(0, 10);
      assert.equal(next.start, after, `${JSON.stringify(card)} ${bill.end} → ${next.start}`);
      assert.deepEqual(shiftBill(card, next, -1), bill);
      bill = next;
    }
  }
});

test('situação da fatura', () => {
  const bill = billClosingIn(nubank, '2026-11');
  assert.equal(billStatus(bill, '2026-10-01'), 'future');
  assert.equal(billStatus(bill, '2026-10-20'), 'open');
  assert.equal(billStatus(bill, '2026-11-05'), 'closed');
  assert.equal(billStatus(bill, '2026-11-11'), 'overdue');
  assert.equal(billLabel(bill, '2026-11-12'), 'Fatura de novembro');
});
