import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

export function Spinner({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

export function FullScreenSpinner() {
  return (
    <div className="flex h-dvh items-center justify-center">
      <Spinner />
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <p className="text-base font-semibold text-ink">{title}</p>
      {children && <div className="mt-1.5 max-w-sm text-sm text-muted">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="mx-auto my-8 max-w-md rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
      {message}
      {onRetry && (
        <button type="button" onClick={onRetry} className="ml-2 font-semibold underline underline-offset-2">
          Tentar de novo
        </button>
      )}
    </div>
  );
}
