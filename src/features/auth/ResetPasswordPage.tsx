import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/Field';
import { FullScreenSpinner } from '../../components/ui/States';
import { errorMessage } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import { AuthLayout } from './AuthLayout';
import { useAuth } from './AuthProvider';

export function ResetPasswordPage() {
  const { session, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (authLoading) return <FullScreenSpinner />;

  if (!session) {
    return (
      <AuthLayout title="Link expirado" subtitle="Este link de recuperação não é mais válido. Peça um novo.">
        <Link to="/esqueci-senha" className="font-medium text-brand hover:underline">
          Pedir novo link
        </Link>
      </AuthLayout>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError('A senha precisa ter pelo menos 8 caracteres.');
    if (password !== confirm) return setError('As senhas não conferem.');
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return setError(errorMessage(error));
    toast.success('Senha alterada');
    navigate('/', { replace: true });
  }

  return (
    <AuthLayout title="Nova senha">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <TextField label="Nova senha" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <TextField label="Repita a senha" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" loading={loading} className="w-full">
          Salvar nova senha
        </Button>
      </form>
    </AuthLayout>
  );
}
