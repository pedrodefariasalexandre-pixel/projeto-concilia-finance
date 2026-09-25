import { supabase } from './supabaseClient';

export const ACCOUNT_KINDS = ['corrente', 'dinheiro', 'cartao_manual'] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export type Account = {
  id: string;
  user_id: string;
  name: string;
  kind: AccountKind;
  opening_balance_cents: number;
  created_at: string;
};

export type AccountInput = {
  name: string;
  kind: AccountKind;
  opening_balance_cents: number;
};

const COLUMNS = 'id, user_id, name, kind, opening_balance_cents, created_at';

export async function listAccounts(userId: string): Promise<Account[]> {
  const { data, error } = await supabase
    .from('accounts')
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('name', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createAccount(userId: string, input: AccountInput): Promise<Account> {
  const { data, error } = await supabase
    .from('accounts')
    .insert({ user_id: userId, ...input })
    .select(COLUMNS)
    .single();

  if (error) throw error;
  return data;
}

export async function updateAccount(id: string, input: AccountInput): Promise<Account> {
  const { data, error } = await supabase
    .from('accounts')
    .update(input)
    .eq('id', id)
    .select(COLUMNS)
    .single();

  if (error) throw error;
  return data;
}
