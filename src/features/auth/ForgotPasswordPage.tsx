import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/Field';
import { errorMessage } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import { AuthLayout } from './AuthLayout';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    setLoading(false);
    if (error) setError(errorMessage(error));
    else setSent(true);
  }

  return (
    <AuthLayout
      title="Recuperar senha"
      subtitle={sent ? 'Se houver uma conta com esse e-mail, você vai receber um link para criar uma nova senha.' : 'Informe seu e-mail e enviaremos um link para criar uma nova senha.'}
      footer={
        <Link to="/entrar" className="font-medium text-brand hover:underline">
          Voltar para o login
        </Link>
      }
    >
      {!sent && (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <TextField label="E-mail" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <Button type="submit" loading={loading} className="w-full" disabled={!email}>
            Enviar link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
