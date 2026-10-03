export function Logo({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg viewBox="0 0 64 64" className="size-8 shrink-0" aria-hidden>
        <rect width="64" height="64" rx="16" fill="var(--brand)" />
        <path d="M20 16h24v32l-4-3-4 3-4-3-4 3-4-3-4 3z" fill="var(--paper)" />
        <path d="M26 26h12M26 33h8" stroke="var(--brand)" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {!compact && <span className="text-lg font-semibold tracking-tight">Anota</span>}
    </div>
  );
}
