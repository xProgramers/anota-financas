export { addDays, endOfMonth, formatBRDate, shiftMonth, startOfMonth, todayIn } from '../../api/_lib/dates';

export function formatMoney(value: number, currency = 'BRL'): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(Number(value) || 0);
}

/** "R$ 1.250,90" → 1250.9 para campos de formulário. */
export function parseMoneyInput(raw: string): number | null {
  const s = raw.replace(/[^\d.,]/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let normalized = s;
  if (lastComma > lastDot) normalized = s.replace(/\./g, '').replace(',', '.');
  else if (lastDot > lastComma && lastComma >= 0) normalized = s.replace(/,/g, '');
  else if (lastDot >= 0 && s.length - lastDot - 1 === 3 && s.split('.').length >= 2) normalized = s.replace(/\./g, '');
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

export function moneyInputValue(n: number | null | undefined): string {
  if (n == null) return '';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const relative = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });

/** "hoje", "ontem" ou dd/mm/aaaa. */
export function friendlyDate(iso: string, today: string): string {
  const diff = Math.round((Date.parse(today) - Date.parse(iso)) / 86_400_000);
  if (diff === 0 || diff === 1) return capitalize(relative.format(-diff, 'day'));
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function timeOf(ts: string): string {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    const msg = (err as { message: string }).message;
    if (/failed to fetch|network/i.test(msg)) return 'Sem conexão. Verifique sua internet e tente novamente.';
    if (/jwt|session|token/i.test(msg)) return 'Sua sessão expirou. Entre novamente.';
    return msg;
  }
  return 'Algo deu errado. Tente novamente.';
}
