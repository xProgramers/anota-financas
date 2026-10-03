import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { SelectField, TextField } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { moneyInputValue, parseMoneyInput } from '../../lib/format';
import type { TxType } from '../../types/db';
import { useCategories } from '../categories/CategoriesProvider';
import type { TransactionInput } from './api';

export interface TransactionFormValues {
  type: TxType;
  amount: number | null;
  category_id: string | null;
  description: string;
  transaction_date: string;
}

interface Props {
  open: boolean;
  title: string;
  submitLabel: string;
  initial: TransactionFormValues;
  onClose: () => void;
  onSubmit: (values: TransactionInput) => Promise<void>;
}

export function TransactionModal({ open, title, submitLabel, initial, onClose, onSubmit }: Props) {
  const { categories } = useCategories();
  const [type, setType] = useState<TxType>(initial.type);
  const [amount, setAmount] = useState(moneyInputValue(initial.amount));
  const [categoryId, setCategoryId] = useState(initial.category_id ?? '');
  const [description, setDescription] = useState(initial.description);
  const [date, setDate] = useState(initial.transaction_date);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setType(initial.type);
    setAmount(moneyInputValue(initial.amount));
    setCategoryId(initial.category_id ?? '');
    setDescription(initial.description);
    setDate(initial.transaction_date);
    setError(null);
    setSaving(false);
  }, [open]);

  const options = useMemo(() => categories.filter((c) => c.type === type), [categories, type]);

  // Ao trocar receita/despesa, a categoria precisa ser do novo tipo.
  useEffect(() => {
    if (categoryId && !options.some((c) => c.id === categoryId)) {
      setCategoryId(options.find((c) => c.name === 'Outros')?.id ?? '');
    }
  }, [options, categoryId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = parseMoneyInput(amount);
    if (!value) return setError('Informe um valor maior que zero.');
    if (value >= 1_000_000_000) return setError('Valor muito alto.');
    if (!categoryId) return setError('Escolha uma categoria.');
    if (!date) return setError('Informe a data.');
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        type,
        amount: value,
        category_id: categoryId,
        description: description.trim().slice(0, 200),
        transaction_date: date,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.');
      setSaving(false);
    }
  }

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div role="radiogroup" aria-label="Tipo" className="grid grid-cols-2 gap-1 rounded-lg bg-paper p-1">
          {(['expense', 'income'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              onClick={() => setType(t)}
              className={`h-9 rounded-md text-sm font-medium transition ${
                type === t ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'
              }`}
            >
              {t === 'expense' ? 'Despesa' : 'Receita'}
            </button>
          ))}
        </div>
        <TextField
          label="Valor"
          inputMode="decimal"
          placeholder="0,00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus={!initial.amount}
        />
        <SelectField label="Categoria" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="" disabled>
            Escolha…
          </option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <TextField label="Descrição" maxLength={200} placeholder="Ex.: Almoço" value={description} onChange={(e) => setDescription(e.target.value)} />
        <TextField label="Data" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
