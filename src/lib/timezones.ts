const FALLBACK = [
  'America/Sao_Paulo', 'America/Manaus', 'America/Belem', 'America/Fortaleza', 'America/Recife', 'America/Bahia',
  'America/Cuiaba', 'America/Campo_Grande', 'America/Porto_Velho', 'America/Boa_Vista', 'America/Rio_Branco',
  'America/Noronha', 'America/Araguaina', 'America/Maceio', 'Europe/Lisbon', 'America/New_York', 'UTC',
];

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
  } catch {
    return 'America/Sao_Paulo';
  }
}

export function timezoneOptions(current?: string): string[] {
  let all: string[] = FALLBACK;
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
    if (intl.supportedValuesOf) all = intl.supportedValuesOf('timeZone');
  } catch {
    /* navegadores antigos */
  }
  const brazil = FALLBACK.filter((z) => z.startsWith('America/') && all.includes(z));
  const rest = all.filter((z) => !brazil.includes(z));
  const list = [...brazil, ...rest];
  if (current && !list.includes(current)) list.unshift(current);
  return list;
}

export const CURRENCIES = [
  { code: 'BRL', label: 'Real (R$)' },
  { code: 'USD', label: 'Dólar (US$)' },
  { code: 'EUR', label: 'Euro (€)' },
];
