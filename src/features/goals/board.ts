// Divide uma meta em casinhas de R$ 5 a R$ 100 que somam exatamente a meta.

export const VALUES = [5, 10, 20, 50, 100] as const;
export const MIN_TARGET = 50;
export const MAX_TARGET = 20000;

// Pesos (por casinha) de cada valor, do mais "miúdo" ao mais graúdo. Usa o
// primeiro perfil que cabe no limite de casinhas, então metas pequenas ficam
// com muitos valores baixos e metas grandes sobem os valores só o necessário.
const PROFILES: number[][] = [
  [5, 4, 2, 1, 0.5],
  [3, 4, 3, 1.5, 1],
  [1, 3, 4, 3, 2],
  [0.5, 1, 3, 4, 4],
  [0, 0.5, 1, 3, 6],
  [0, 0, 0, 1, 8],
  [0, 0, 0, 0, 1],
];

/** Mensagem de erro para a meta digitada, ou null se ela é válida. */
export function validateTarget(target: number | null): string | null {
  if (target == null || !Number.isFinite(target)) return 'Informe o valor da meta.';
  if (!Number.isInteger(target) || target % 5 !== 0) return 'Use um valor múltiplo de R$ 5 (ex.: 500, 1.000, 2.350).';
  if (target < MIN_TARGET) return 'A meta precisa ser de pelo menos R$ 50.';
  if (target > MAX_TARGET) return 'A meta pode ser de até R$ 20.000.';
  return null;
}

/** Quantidade máxima de casinhas para uma meta: 150, ou o mínimo possível acima disso. */
export function maxCells(target: number): number {
  return Math.max(150, Math.ceil(target / 100));
}

function pick(remaining: number, weights: number[], rng: () => number): number {
  const options = VALUES.map((v, i) => [v, weights[i]] as const).filter(([v, w]) => v <= remaining && w > 0);
  // Sobrou menos que o menor valor do perfil: fecha com o maior valor que cabe.
  if (options.length === 0) return [...VALUES].reverse().find((v) => v <= remaining)!;
  const total = options.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [v, w] of options) {
    r -= w;
    if (r < 0) return v;
  }
  return options[options.length - 1][0];
}

function fill(target: number, weights: number[], rng: () => number): number[] {
  const out: number[] = [];
  let remaining = target;
  while (remaining > 0) {
    const v = pick(remaining, weights, rng);
    out.push(v);
    remaining -= v;
  }
  return out;
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Valores das casinhas, embaralhados. A meta precisa passar em validateTarget. */
export function splitGoal(target: number, rng: () => number = Math.random): number[] {
  const limit = maxCells(target);
  let cells: number[] = [];
  for (const weights of PROFILES) {
    cells = fill(target, weights, rng);
    if (cells.length <= limit) break;
  }
  return shuffle(cells, rng);
}

/** Quantas casinhas de cada valor, do menor para o maior. */
export function countByValue(cells: number[]): Array<{ value: number; count: number }> {
  return VALUES.map((value) => ({ value, count: cells.filter((c) => c === value).length })).filter((c) => c.count > 0);
}
