import { supabase } from './supabaseClient';

export type Category = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
};

const COLUMNS = 'id, user_id, name, created_at';

export async function listCategories(userId: string): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('name', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createCategory(userId: string, name: string): Promise<Category> {
  const { data, error } = await supabase
    .from('categories')
    .insert({ user_id: userId, name })
    .select(COLUMNS)
    .single();

  if (error) throw error;
  return data;
}

export async function updateCategory(id: string, name: string): Promise<Category> {
  const { data, error } = await supabase
    .from('categories')
    .update({ name })
    .eq('id', id)
    .select(COLUMNS)
    .single();

  if (error) throw error;
  return data;
}

/**
 * categories.id é referenciada por transactions.category_id e fixed_charges.category_id
 * com ON DELETE SET NULL (0001_init.sql) — o banco nunca rejeita a exclusão, só desvincula
 * as referências. Este helper existe para avisar o usuário disso ANTES de excluir.
 */
export async function categoryIsReferenced(categoryId: string): Promise<boolean> {
  const [transactions, fixedCharges] = await Promise.all([
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('category_id', categoryId),
    supabase.from('fixed_charges').select('id', { count: 'exact', head: true }).eq('category_id', categoryId),
  ]);

  if (transactions.error) throw transactions.error;
  if (fixedCharges.error) throw fixedCharges.error;

  return (transactions.count ?? 0) > 0 || (fixedCharges.count ?? 0) > 0;
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw error;
}
