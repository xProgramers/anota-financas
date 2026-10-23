import { supabase } from '../../lib/supabase';
import type { SavingsGoal, SavingsGoalCell } from '../../types/db';

export interface GoalWithProgress extends SavingsGoal {
  saved: number;
  cells: number;
  marked: number;
}

export async function listGoals(): Promise<GoalWithProgress[]> {
  const { data, error } = await supabase
    .from('savings_goals')
    .select('*, savings_goal_cells(amount, marked_at)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(({ savings_goal_cells: cells, ...goal }) => {
    const list = (cells ?? []) as Array<Pick<SavingsGoalCell, 'amount' | 'marked_at'>>;
    const marked = list.filter((c) => c.marked_at);
    return {
      ...(goal as SavingsGoal),
      saved: marked.reduce((s, c) => s + Number(c.amount), 0),
      cells: list.length,
      marked: marked.length,
    };
  });
}

export async function getGoal(id: string) {
  const [goal, cells] = await Promise.all([
    supabase.from('savings_goals').select('*').eq('id', id).maybeSingle(),
    supabase.from('savings_goal_cells').select('*').eq('goal_id', id).order('position'),
  ]);
  if (goal.error) throw goal.error;
  if (cells.error) throw cells.error;
  return { goal: goal.data as SavingsGoal | null, cells: (cells.data ?? []) as SavingsGoalCell[] };
}

export async function createGoal(name: string, amounts: number[]) {
  const { data, error } = await supabase.rpc('create_savings_goal', { p_name: name, p_amounts: amounts });
  if (error) throw error;
  return data as SavingsGoal;
}

export async function setCellMarked(id: string, marked: boolean) {
  const { data, error } = await supabase
    .from('savings_goal_cells')
    .update({ marked_at: marked ? new Date().toISOString() : null })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as SavingsGoalCell;
}

export async function renameGoal(id: string, name: string) {
  const { error } = await supabase.from('savings_goals').update({ name }).eq('id', id);
  if (error) throw error;
}

export async function deleteGoal(id: string) {
  const { error } = await supabase.from('savings_goals').delete().eq('id', id);
  if (error) throw error;
}
