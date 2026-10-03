import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { SelectField, TextField } from '../../components/ui/Field';
import { errorMessage } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import { browserTimezone, CURRENCIES, timezoneOptions } from '../../lib/timezones';
import { AuthLayout } from './AuthLayout';
import { useAuth } from './AuthProvider';

export function OnboardingPage() {
  const { profile, refreshProfile, session } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(profile?.name ?? '');
  const [currency, setCurrency] = useState(profile?.currency ?? 'BRL');
  const [timezone, setTimezone] = useState(browserTimezone());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    setSaving(true);
    setError(null);
    const { error } = await supabase
      .from('profiles')
      .update({ name: name.trim().slice(0, 80) || null, currency, timezone, onboarded: true })
      .eq('user_id', session.user.id);
    if (error) {
      setSaving(false);
      setError(errorMessage(error));
      return;
    }
    await refreshProfile();
    navigate('/', { replace: true, state: { welcome: true } });
  }

  return (
    <AuthLayout title="Vamos começar" subtitle="Três detalhes e você já pode anotar seu primeiro gasto.">
      <form onSubmit={onSubmit} className="space-y-4">
        <TextField label="Como podemos te chamar?" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoFocus />
        <SelectField label="Moeda padrão" value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Fuso horário"
          hint="Usado para entender “hoje” e “ontem”."
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
        >
          {timezoneOptions(timezone).map((z) => (
            <option key={z} value={z}>
              {z.replace(/_/g, ' ')}
            </option>
          ))}
        </SelectField>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" loading={saving} className="w-full">
          Ir para o chat
        </Button>
      </form>
    </AuthLayout>
  );
}
