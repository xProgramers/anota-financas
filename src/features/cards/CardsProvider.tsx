import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '../../lib/supabase';
import type { CreditCard } from '../../types/db';
import { useAuth } from '../auth/AuthProvider';

interface CardsState {
  cards: CreditCard[];
  loading: boolean;
  /**
   * false enquanto a tabela de cartões não existe no banco (migration 0004 ainda
   * não aplicada). Nesse caso o app funciona exatamente como antes.
   */
  available: boolean;
  byId: Map<string, CreditCard>;
  reload: () => Promise<void>;
}

const CardsContext = createContext<CardsState | null>(null);

export function CardsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(false);

  const reload = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase.from('credit_cards').select('*').eq('user_id', userId).order('created_at');
    setAvailable(!error);
    setCards(error ? [] : ((data as CreditCard[] | null) ?? []));
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo(
    () => ({ cards, loading, available, reload, byId: new Map(cards.map((c) => [c.id, c])) }),
    [cards, loading, available, reload],
  );
  return <CardsContext.Provider value={value}>{children}</CardsContext.Provider>;
}

export function useCards(): CardsState {
  const ctx = useContext(CardsContext);
  if (!ctx) throw new Error('useCards precisa estar dentro de <CardsProvider>');
  return ctx;
}
