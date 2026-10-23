// Testes da divisão da meta em casinhas (sem rede).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_TARGET, MIN_TARGET, VALUES, maxCells, splitGoal, validateTarget } from '../src/features/goals/board.js';

// Gerador previsível para os testes não dependerem da sorte.
function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  };
}

test('casinhas somam exatamente a meta, com valores de R$ 5 a R$ 100', () => {
  for (const target of [50, 55, 100, 345, 1000, 2350, 5000, 10000, 15000, MAX_TARGET]) {
    for (let s = 1; s <= 20; s++) {
      const cells = splitGoal(target, seeded(s * 7919 + target));
      assert.equal(cells.reduce((a, b) => a + b, 0), target, `soma da meta ${target}`);
      assert.ok(cells.every((c) => (VALUES as readonly number[]).includes(c)), `valores da meta ${target}`);
      assert.ok(cells.length <= maxCells(target), `meta ${target} gerou ${cells.length} casinhas`);
    }
  }
});

test('metas pequenas favorecem valores baixos', () => {
  const cells = splitGoal(1000, seeded(42));
  const small = cells.filter((c) => c <= 20).length;
  assert.ok(small / cells.length > 0.6, `só ${small} de ${cells.length} casinhas até R$ 20`);
  assert.ok(cells.length >= 30, `poucas casinhas: ${cells.length}`);
});

test('validação da meta', () => {
  assert.equal(validateTarget(1000), null);
  assert.equal(validateTarget(MIN_TARGET), null);
  assert.match(validateTarget(null)!, /Informe/);
  assert.match(validateTarget(1003)!, /múltiplo/);
  assert.match(validateTarget(10.5)!, /múltiplo/);
  assert.match(validateTarget(45)!, /pelo menos/);
  assert.match(validateTarget(MAX_TARGET + 5)!, /até/);
});
