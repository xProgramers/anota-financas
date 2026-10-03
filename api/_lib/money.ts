// Interpretação de valores no formato brasileiro.

const MAX_AMOUNT = 999_999_999.99;

/**
 * Converte um texto numérico brasileiro em número.
 * Aceita: "10", "10,50", "10.50", "1.250,90", "1.250", "1250.9", "4.500".
 */
export function parseBRNumber(raw: string): number | null {
  let s = raw.trim().replace(/\s/g, '');
  if (!/^\d[\d.,]*$/.test(s)) return null;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  if (lastComma >= 0 && lastDot >= 0) {
    // O separador que aparece por último é o decimal.
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length <= 2) s = parts[0] + '.' + parts[1];
    else if (parts.slice(1).every((p) => p.length === 3)) s = parts.join('');
    else return null;
  } else if (lastDot >= 0) {
    const parts = s.split('.');
    if (parts.length === 2 && parts[1].length <= 2) {
      // "10.50" → decimal
    } else if (parts.slice(1).every((p) => p.length === 3)) {
      s = parts.join(''); // "4.500" / "1.250.000" → milhar
    } else return null;
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Normaliza um valor vindo da IA (número ou string) para 2 casas, ou null. */
export function normalizeAmount(value: unknown): number | null {
  let n: number | null = null;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string') n = parseBRNumber(value.replace(/r\$|reais?/gi, ''));
  if (n === null || !Number.isFinite(n) || n <= 0 || n > MAX_AMOUNT) return null;
  return Math.round(n * 100) / 100;
}

export function formatBRL(n: number, currency = 'BRL'): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(n);
}
