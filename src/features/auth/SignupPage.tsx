import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/Field';
import { errorMessage } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import { AuthLayout } from './AuthLayout';
import { useAuth } from './AuthProvider';

export function SignupPage() {
  const { session } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (session) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { name: name.trim().slice(0, 80) }, emailRedirectTo: window.location.origin },
    });
    setLoading(false);
    if (error) {
      setError(/already registered/i.test(error.message) ? 'Já existe uma conta com este e-mail.' : errorMessage(error));
      return;
    }
    // Com confirmação de e-mail ligada não há sessão ainda.
    if (!data.session) setSentTo(email.trim());
  }

  if (sentTo) {
    return (
      <AuthLayout title="Confira seu e-mail" subtitle={`Enviamos um link de confirmação para ${sentTo}. Abra o link para ativar sua conta.`}>
        <Link to="/entrar" className="font-medium text-brand hover:underline">
          Voltar para o login
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Criar conta"
      subtitle="Leva menos de um minuto."
      footer={
        <>
          Já tem conta?{' '}
          <Link to="/entrar" className="font-medium text-brand hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <TextField label="Seu nome" autoComplete="given-name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        <TextField label="E-mail" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField
          label="Senha"
          type="password"
          autoComplete="new-password"
          hint="Mínimo de 8 caracteres."
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
          Criar conta
        </Button>
      </form>
    </AuthLayout>
  );
}
