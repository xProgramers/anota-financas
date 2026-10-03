import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/Field';
import { errorMessage } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import { AuthLayout } from './AuthLayout';
import { useAuth } from './AuthProvider';

export function LoginPage() {
  const { session } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (session) return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/'} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      setError(
        /invalid login/i.test(error.message)
          ? 'E-mail ou senha incorretos.'
          : /not confirmed/i.test(error.message)
            ? 'Confirme seu e-mail pelo link que enviamos antes de entrar.'
            : errorMessage(error),
      );
    }
  }

  return (
    <AuthLayout
      title="Entrar"
      subtitle="Seus gastos, anotados em uma mensagem."
      footer={
        <>
          Ainda não tem conta?{' '}
          <Link to="/cadastro" className="font-medium text-brand hover:underline">
            Criar conta
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <TextField label="E-mail" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField
          label="Senha"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" loading={loading} className="w-full" disabled={!email || !password}>
          Entrar
        </Button>
        <p className="text-center text-sm">
          <Link to="/esqueci-senha" className="text-muted hover:text-ink hover:underline">
            Esqueci minha senha
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
