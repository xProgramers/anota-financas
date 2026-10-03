// Datas como strings ISO (YYYY-MM-DD), sempre calculadas no fuso do usuário.
import type { QueryPeriod } from './types.js';

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** "Hoje" no fuso informado, usando o relógio do servidor. */
export function todayIn(tz: string, now: Date = new Date()): { today: string; weekday: number } {
  const zone = isValidTimezone(tz) ? tz : 'America/Sao_Paulo';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now); // en-CA → YYYY-MM-DD
  return { today: parts, weekday: weekdayOf(parts) };
}

function toUTC(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isValidISODate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = toUTC(s);
  return !Number.isNaN(d.getTime()) && fromUTC(d) === s;
}

export function addDays(iso: string, n: number): string {
  const d = toUTC(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUTC(d);
}

export function weekdayOf(iso: string): number {
  return toUTC(iso).getUTCDay();
}

export function startOfMonth(iso: string): string {
  return iso.slice(0, 8) + '01';
}

export function endOfMonth(iso: string): string {
  const d = toUTC(startOfMonth(iso));
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return fromUTC(d);
}

export function shiftMonth(iso: string, n: number): string {
  const d = toUTC(startOfMonth(iso));
  d.setUTCMonth(d.getUTCMonth() + n);
  return fromUTC(d);
}

/** Semana começando na segunda-feira. */
export function startOfWeek(iso: string): string {
  const wd = weekdayOf(iso);
  return addDays(iso, -((wd + 6) % 7));
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86_400_000);
}

export function periodRange(
  period: QueryPeriod,
  today: string,
): { start: string; end: string; label: string } {
  switch (period) {
    case 'today':
      return { start: today, end: today, label: 'hoje' };
    case 'yesterday': {
      const y = addDays(today, -1);
      return { start: y, end: y, label: 'ontem' };
    }
    case 'this_week':
      return { start: startOfWeek(today), end: today, label: 'esta semana' };
    case 'last_week': {
      const s = addDays(startOfWeek(today), -7);
      return { start: s, end: addDays(s, 6), label: 'na semana passada' };
    }
    case 'last_month': {
      const s = shiftMonth(today, -1);
      return { start: s, end: endOfMonth(s), label: 'no mês passado' };
    }
    case 'this_year':
      return { start: today.slice(0, 4) + '-01-01', end: today, label: 'este ano' };
    case 'last_7_days':
      return { start: addDays(today, -6), end: today, label: 'nos últimos 7 dias' };
    case 'last_30_days':
      return { start: addDays(today, -29), end: today, label: 'nos últimos 30 dias' };
    case 'this_month':
    case 'custom':
    default:
      return { start: startOfMonth(today), end: today, label: 'este mês' };
  }
}

export function formatBRDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
