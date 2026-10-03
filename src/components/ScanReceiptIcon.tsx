/** Ícone próprio: um cupom dentro da moldura de leitura da câmera. */
export function ScanReceiptIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M3 7.5V5.5a2.5 2.5 0 0 1 2.5-2.5h2M16.5 3h2A2.5 2.5 0 0 1 21 5.5v2M21 16.5v2a2.5 2.5 0 0 1-2.5 2.5h-2M7.5 21h-2A2.5 2.5 0 0 1 3 18.5v-2" />
      <path d="M8 6.5h8v11l-1.6-1.1-1.6 1.1-1.6-1.1-1.6 1.1-1.6-1.1L8 17.5z" />
      <path d="M10.2 9.6h3.6M10.2 12.4h2.4" />
    </svg>
  );
}
