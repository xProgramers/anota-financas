import { LogOut, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Page, PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { SelectField, TextField } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { errorMessage } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import { CURRENCIES, timezoneOptions } from '../../lib/timezones';
import type { Category, TxType } from '../../types/db';
import { useAuth } from '../auth/AuthProvider';
import { useCategories } from '../categories/CategoriesProvider';
import { CategoryIcon, ICONS } from '../categories/CategoryIcon';

const COLORS = ['#e8590c', '#1c7ed6', '#7048e8', '#c2255c', '#2f9e44', '#0c8599', '#f08c00', '#5f3dc4', '#e03131', '#868e96'];

export function SettingsPage() {
  const { profile, session, refreshProfile, signOut } = useAuth();
  const [name, setName] = useState(profile?.name ?? '');
  const [currency, setCurrency] = useState(profile?.currency ?? 'BRL');
  const [timezone, setTimezone] = useState(profile?.timezone ?? 'America/Sao_Paulo');
  const [saving, setSaving] = useState(false);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ name: name.trim().slice(0, 80) || null, currency, timezone })
      .eq('user_id', session.user.id);
    setSaving(false);
    if (error) return toast.error(errorMessage(error));
    await refreshProfile();
    toast.success('Perfil salvo');
  }

  const dirty = name !== (profile?.name ?? '') || currency !== profile?.currency || timezone !== profile?.timezone;

  return (
    <Page>
      <PageHeader title="Configurações" />

      <div className="max-w-2xl space-y-12">
        <section>
          <h2 className="text-base font-semibold">Perfil</h2>
          <p className="mt-1 mb-5 text-sm text-muted">{session?.user.email}</p>
          <form onSubmit={saveProfile} className="grid gap-4 sm:grid-cols-2">
            <TextField label="Nome" className="sm:col-span-2" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
            <SelectField label="Moeda padrão" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </SelectField>
            <SelectField label="Fuso horário" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {timezoneOptions(timezone).map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, ' ')}
                </option>
              ))}
            </SelectField>
            <div className="sm:col-span-2">
              <Button type="submit" loading={saving} disabled={!dirty}>
                Salvar perfil
              </Button>
            </div>
          </form>
        </section>

        <CategoriesSection />

        <section>
          <h2 className="mb-4 text-base font-semibold">Sessão</h2>
          <Button variant="secondary" onClick={() => void signOut()} icon={<LogOut className="size-4" />}>
            Sair da conta
          </Button>
        </section>
      </div>
    </Page>
  );
}

function CategoriesSection() {
  const { categories, reload } = useCategories();
  const { session } = useAuth();
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    if (!toDelete) return;
    setDeleting(true);
    const { error } = await supabase.from('categories').delete().eq('id', toDelete.id);
    setDeleting(false);
    if (error) return toast.error(errorMessage(error));
    toast.success('Categoria excluída');
    setToDelete(null);
    void reload();
  }

  const groups: Array<[TxType, string]> = [
    ['expense', 'Despesas'],
    ['income', 'Receitas'],
  ];

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Categorias</h2>
          <p className="mt-1 text-sm text-muted">A IA usa estas categorias para classificar suas mensagens.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setEditing('new')} icon={<Plus className="size-4" />}>
          Nova categoria
        </Button>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {groups.map(([type, title]) => (
          <div key={type}>
            <h3 className="mb-2 text-sm font-medium text-muted">{title}</h3>
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
              {categories
                .filter((c) => c.type === type)
                .map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-3 py-2">
                    <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                    <span className="flex-1 truncate text-sm">{c.name}</span>
                    <button
                      type="button"
                      onClick={() => setEditing(c)}
                      className="rounded-md p-1.5 text-muted hover:bg-ink/5 hover:text-ink"
                      aria-label={`Editar ${c.name}`}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    {!c.is_default && (
                      <button
                        type="button"
                        onClick={() => setToDelete(c)}
                        className="rounded-md p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
                        aria-label={`Excluir ${c.name}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>

      {editing && session && (
        <CategoryModal
          category={editing === 'new' ? null : editing}
          userId={session.user.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Excluir categoria?"
        message={`As transações em “${toDelete?.name ?? ''}” serão mantidas, mas ficarão sem categoria.`}
        confirmLabel="Excluir"
        loading={deleting}
        onConfirm={() => void remove()}
        onClose={() => setToDelete(null)}
      />
    </section>
  );
}

function CategoryModal({ category, userId, onClose, onSaved }: { category: Category | null; userId: string; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(category?.name ?? '');
  const [type, setType] = useState<TxType>(category?.type ?? 'expense');
  const [icon, setIcon] = useState(category?.icon ?? 'tag');
  const [color, setColor] = useState(category?.color ?? COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => setError(null), [name, type]);

  async function save(e: FormEvent) {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return setError('Dê um nome à categoria.');
    if (clean.length > 40) return setError('Use no máximo 40 caracteres.');
    setSaving(true);
    const { error } = category
      ? await supabase.from('categories').update({ name: clean, icon, color }).eq('id', category.id)
      : await supabase.from('categories').insert({ user_id: userId, name: clean, type, icon, color });
    setSaving(false);
    if (error) return setError(error.code === '23505' ? 'Já existe uma categoria com esse nome.' : errorMessage(error));
    toast.success(category ? 'Categoria atualizada' : 'Categoria criada');
    onSaved();
  }

  return (
    <Modal open title={category ? 'Editar categoria' : 'Nova categoria'} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <TextField label="Nome" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        {!category && (
          <SelectField label="Tipo" value={type} onChange={(e) => setType(e.target.value as TxType)}>
            <option value="expense">Despesa</option>
            <option value="income">Receita</option>
          </SelectField>
        )}
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Ícone</legend>
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(ICONS).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setIcon(key)}
                aria-pressed={icon === key}
                aria-label={key}
                className={`rounded-full p-0.5 ring-2 ${icon === key ? 'ring-brand' : 'ring-transparent'}`}
              >
                <CategoryIcon icon={key} color={color} size="sm" />
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Cor</legend>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-pressed={color === c}
                aria-label={`Cor ${c}`}
                className={`size-7 rounded-full ring-2 ring-offset-2 ring-offset-surface ${color === c ? 'ring-ink' : 'ring-transparent'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving}>
            {category ? 'Salvar' : 'Criar categoria'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
