import { Shuffle } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { errorMessage, formatMoney, parseMoneyInput } from '../../lib/format';
import { createGoal } from './api';
import { countByValue, splitGoal, validateTarget } from './board';

interface Props {
  open: boolean;
  currency: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}

export function NewGoalModal({ open, currency, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [rawTarget, setRawTarget] = useState('');
  const [seed, setSeed] = useState(0);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setRawTarget('');
      setTouched(false);
    }
  }, [open]);

  const target = parseMoneyInput(rawTarget);
  const targetError = validateTarget(target);
  // seed muda a cada "Sortear de novo" e gera outra divisão para o mesmo valor
  const cells = useMemo(() => (seed >= 0 && !targetError ? splitGoal(target!) : []), [target, targetError, seed]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (targetError) return;
    setSaving(true);
    try {
      const goal = await createGoal(name.trim() || `Meta de ${formatMoney(target!, currency)}`, cells);
      toast.success('Meta criada');
      onClose();
      onCreated(goal.id);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Nova meta"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="new-goal" loading={saving}>
            Criar quadro
          </Button>
        </>
      }
    >
      <form id="new-goal" onSubmit={submit} className="space-y-4">
        <TextField label="Nome" placeholder="Ex.: Viagem, reserva, celular novo" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        <TextField
          label="Quanto você quer juntar?"
          inputMode="decimal"
          placeholder="R$ 1.000"
          value={rawTarget}
          onChange={(e) => setRawTarget(e.target.value)}
          onBlur={() => setTouched(true)}
          error={touched ? targetError : null}
          hint="De R$ 50 a R$ 20.000, em múltiplos de R$ 5."
        />

        {cells.length > 0 && (
          <div className="rounded-xl border border-line bg-paper p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{cells.length} casinhas</p>
              <button
                type="button"
                onClick={() => setSeed((s) => s + 1)}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-brand hover:bg-brand-soft"
              >
                <Shuffle className="size-3.5" aria-hidden />
                Sortear de novo
              </button>
            </div>
            <ul className="mt-2 flex flex-wrap gap-1.5 text-sm">
              {countByValue(cells).map(({ value, count }) => (
                <li key={value} className="rounded-full border border-line bg-surface px-2.5 py-0.5">
                  {count}× <span className="font-mono font-semibold">R$ {value}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>
    </Modal>
  );
}
