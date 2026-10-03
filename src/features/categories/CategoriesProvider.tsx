import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '../../lib/supabase';
import type { Category } from '../../types/db';
import { useAuth } from '../auth/AuthProvider';

interface CategoriesState {
  categories: Category[];
  loading: boolean;
  byId: Map<string, Category>;
  reload: () => Promise<void>;
}

const CategoriesContext = createContext<CategoriesState | null>(null);

export function CategoriesProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .order('created_at');
    setCategories((data as Category[] | null) ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo(
    () => ({ categories, loading, reload, byId: new Map(categories.map((c) => [c.id, c])) }),
    [categories, loading, reload],
  );
  return <CategoriesContext.Provider value={value}>{children}</CategoriesContext.Provider>;
}

export function useCategories(): CategoriesState {
  const ctx = useContext(CategoriesContext);
  if (!ctx) throw new Error('useCategories precisa estar dentro de <CategoriesProvider>');
  return ctx;
}
