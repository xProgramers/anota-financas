import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const styles: Record<Variant, string> = {
  primary: 'bg-brand text-brand-ink hover:brightness-110 active:brightness-95',
  secondary: 'bg-surface text-ink border border-line hover:bg-paper',
  ghost: 'text-muted hover:text-ink hover:bg-ink/5',
  danger: 'bg-danger text-white hover:brightness-110',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = 'primary', size = 'md', loading, icon, children, className = '', disabled, ...rest }: Props) {
  const sizing = size === 'sm' ? 'h-8 px-3 text-sm gap-1.5' : 'h-11 px-4 text-[15px] gap-2';
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${sizing} ${styles[variant]} ${className}`}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}
