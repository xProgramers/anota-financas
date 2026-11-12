import { Check } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { errorMessage } from '../../lib/format';
import type { CreditCard } from '../../types/db';
import { useAuth } from '../auth/AuthProvider';
import { CARD_COLORS, createCard, updateCard } from './api';
import { useCards } from './CardsProvider';

interface Props {
  open: boolean;
  card: CreditCard | null;
  onClose: () => void;
  onSaved: (card: CreditCard) => void;
}

function parseDay(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
}

export function CardModal({ open, card, onClose, onSaved }: Props) {
  const { session } = useAuth();
  const { reload } = useCards();
  const [name, setName] = useState('');
  const [closing, setClosing] = useState('');
  const [due, setDue] = useState('');
  const [color, setColor] = useState(CARD_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(card?.name ?? '');
    setClosing(card ? String(card.closing_day) : '');
    setDue(card ? String(card.due_day) : '');
    setColor(card?.color ?? CARD_COLORS[0]);
    setError(null);
    setSaving(false);
  }, [open, card]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const closingDay = parseDay(closing);
    const dueDay = parseDay(due);
    if (!name.trim()) return setError('Dê um nome ao cartão.');
    if (!closingDay) return setError('Informe o dia de fechamento (1 a 31).');
    if (!dueDay) return setError('Informe o dia de vencimento (1 a 31).');
    setSaving(true);
    setError(null);
    const input = { name: name.trim().slice(0, 30), closing_day: closingDay, due_day: dueDay, color };
    try {
      const saved = card ? await updateCard(card.id, input) : await createCard(session!.user.id, input);
      await reload();
      toast.success(card ? 'Cartão atualizado' : 'Cartão cadastrado');
      onSaved(saved);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title={card ? 'Editar cartão' : 'Novo cartão'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="card-form" loading={saving}>
            {card ? 'Salvar' : 'Cadastrar'}
          </Button>
        </>
      }
    >
      <form id="card-form" onSubmit={submit} className="space-y-4" noValidate>
        <TextField label="Nome" placeholder="Ex.: Nubank, Inter, Itaú" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Dia que fecha"
            inputMode="numeric"
            placeholder="Ex.: 3"
            maxLength={2}
            value={closing}
            onChange={(e) => setClosing(e.target.value.replace(/\D/g, ''))}
          />
          <TextField
            label="Dia que vence"
            inputMode="numeric"
            placeholder="Ex.: 10"
            maxLength={2}
            value={due}
            onChange={(e) => setDue(e.target.value.replace(/\D/g, ''))}
          />
        </div>
        <p className="-mt-2 text-sm text-muted">Estão no app do banco ou na fatura. Compras depois do fechamento vão para a fatura seguinte.</p>
        <fieldset>
          <legend className="mb-1.5 block text-sm font-medium text-ink">Cor</legend>
          <div className="flex flex-wrap gap-2">
            {CARD_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Cor ${c}`}
                aria-pressed={color === c}
                className="flex size-9 items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition aria-pressed:ring-2 aria-pressed:ring-ink"
                style={{ backgroundColor: c }}
              >
                {color === c && <Check className="size-4 text-white" aria-hidden />}
              </button>
            ))}
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
