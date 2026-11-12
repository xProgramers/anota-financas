// Ciclo da fatura do cartão. Datas como strings ISO (YYYY-MM-DD), sem fuso.
//
// Regra usada pelos bancos brasileiros: a compra feita ATÉ o dia de fechamento
// entra na fatura que fecha naquele mês; depois dele, vai para a do mês seguinte.
// A fatura leva o nome do mês em que vence.

export interface CardCycle {
  closing_day: number;
  due_day: number;
}

export interface Bill {
  /** primeiro dia de compras desta fatura */
  start: string;
  /** dia de fechamento (último dia de compras) */
  end: string;
  /** vencimento */
  due: string;
  /** mês de referência YYYY-MM do fechamento, usado para navegar */
  closingMonth: string;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function lastDay(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Dia `day` do mês, ou o último dia se o mês for mais curto (31 → 28/fev). */
function dayIn(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(Math.min(day, lastDay(year, month)))}`;
}

function shift(year: number, month: number, n: number): [number, number] {
  const idx = year * 12 + (month - 1) + n;
  return [Math.floor(idx / 12), (idx % 12) + 1];
}

function nextDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return dt.toISOString().slice(0, 10);
}

/** Fatura que fecha no mês YYYY-MM informado. */
export function billClosingIn(card: CardCycle, closingMonth: string): Bill {
  const [y, m] = closingMonth.split('-').map(Number);
  const end = dayIn(y, m, card.closing_day);
  const [py, pm] = shift(y, m, -1);
  const start = nextDay(dayIn(py, pm, card.closing_day));
  // Vencimento depois do fechamento no mesmo mês, ou no mês seguinte.
  const [dy, dm] = card.due_day > card.closing_day ? [y, m] : shift(y, m, 1);
  return { start, end, due: dayIn(dy, dm, card.due_day), closingMonth: `${y}-${pad(m)}` };
}

/** Fatura em que cai uma compra feita na data informada. */
export function billForDate(card: CardCycle, iso: string): Bill {
  const [y, m] = iso.split('-').map(Number);
  const thisMonth = billClosingIn(card, `${y}-${pad(m)}`);
  if (iso <= thisMonth.end) return thisMonth;
  const [ny, nm] = shift(y, m, 1);
  return billClosingIn(card, `${ny}-${pad(nm)}`);
}

/** Fatura anterior (n = -1) ou seguinte (n = 1). */
export function shiftBill(card: CardCycle, bill: Bill, n: number): Bill {
  const [y, m] = bill.closingMonth.split('-').map(Number);
  const [sy, sm] = shift(y, m, n);
  return billClosingIn(card, `${sy}-${pad(sm)}`);
}

export type BillStatus = 'open' | 'closed' | 'overdue' | 'future';

export function billStatus(bill: Bill, today: string): BillStatus {
  if (today < bill.start) return 'future';
  if (today <= bill.end) return 'open';
  if (today <= bill.due) return 'closed';
  return 'overdue';
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "Fatura de dezembro" (pelo mês do vencimento); mostra o ano se não for o atual. */
export function billLabel(bill: Bill, today: string): string {
  const [y, m] = bill.due.split('-').map(Number);
  const year = String(y) === today.slice(0, 4) ? '' : ` de ${y}`;
  return `Fatura de ${MONTHS[m - 1]}${year}`;
}

/** "05/12" */
export function shortDate(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}
