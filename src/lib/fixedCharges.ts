import { supabase } from './supabaseClient';

export type FixedCharge = {
  id: string;
  user_id: string;
  description: string;
  amount_cents: number;
  category_id: string | null;
  person_ids: string[];
  installment_current: number | null;
  installment_total: number | null;
  active: boolean;
  last_advanced_competency: string | null;
  created_at: string;
};

export type FixedChargeInput = {
  description: string;
  amount_cents: number;
  category_id: string | null;
  person_ids: string[];
  installment_current: number | null;
  installment_total: number | null;
  active: boolean;
};

const COLUMNS =
  'id, user_id, description, amount_cents, category_id, person_ids, installment_current, installment_total, active, last_advanced_competency, created_at';

export async function listFixedCharges(userId: string): Promise<FixedCharge[]> {
  const { data, error } = await supabase
    .from('fixed_charges')
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('active', { ascending: false })
    .order('description', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createFixedCharge(userId: string, input: FixedChargeInput): Promise<FixedCharge> {
  const { data, error } = await supabase
    .from('fixed_charges')
    .insert({ user_id: userId, ...input })
    .select(COLUMNS)
    .single();

  if (error) throw error;
  return data;
}

export async function updateFixedCharge(id: string, input: FixedChargeInput): Promise<FixedCharge> {
  const { data, error } = await supabase
    .from('fixed_charges')
    .update(input)
    .eq('id', id)
    .select(COLUMNS)
    .single();

  if (error) throw error;
  return data;
}

export async function deleteFixedCharge(id: string): Promise<void> {
  const { error } = await supabase.from('fixed_charges').delete().eq('id', id);
  if (error) throw error;
}
