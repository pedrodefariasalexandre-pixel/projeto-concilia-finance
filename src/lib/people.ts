import { supabase } from './supabaseClient';

export type Person = {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  color: string | null;
  archived: boolean;
  created_at: string;
};

export type PersonInput = {
  name: string;
  phone: string | null;
  color: string | null;
};

const COLUMNS = 'id, user_id, name, phone, color, archived, created_at';

export async function listPeople(userId: string): Promise<Person[]> {
  const { data, error } = await supabase
    .from('people')
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('archived', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createPerson(userId: string, input: PersonInput): Promise<Person> {
  const { data, error } = await supabase
    .from('people')
    .insert({ user_id: userId, name: input.name, phone: input.phone, color: input.color })
    .select(COLUMNS)
    .single();

  if (error) throw error;
  return data;
}

export async function updatePerson(id: string, input: PersonInput): Promise<Person> {
  const { data, error } = await supabase
    .from('people')
    .update({ name: input.name, phone: input.phone, color: input.color })
    .eq('id', id)
    .select(COLUMNS)
    .single();

  if (error) throw error;
  return data;
}

export async function setPersonArchived(id: string, archived: boolean): Promise<Person> {
  const { data, error } = await supabase
    .from('people')
    .update({ archived })
    .eq('id', id)
    .select(COLUMNS)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Verifica se a pessoa está referenciada em QUALQUER estrutura real do schema antes de
 * permitir exclusão física — não só transaction_people. fixed_charges.person_ids e
 * memory_rules.person_ids são uuid[] sem FK (0001_init.sql), então o banco não impede
 * nem avisa sozinho; a checagem tem que cobrir os três.
 */
export async function personIsReferenced(personId: string): Promise<boolean> {
  const [transactionPeople, fixedCharges, memoryRules] = await Promise.all([
    supabase.from('transaction_people').select('id', { count: 'exact', head: true }).eq('person_id', personId),
    supabase.from('fixed_charges').select('id', { count: 'exact', head: true }).contains('person_ids', [personId]),
    supabase.from('memory_rules').select('id', { count: 'exact', head: true }).contains('person_ids', [personId]),
  ]);

  if (transactionPeople.error) throw transactionPeople.error;
  if (fixedCharges.error) throw fixedCharges.error;
  if (memoryRules.error) throw memoryRules.error;

  return (transactionPeople.count ?? 0) > 0 || (fixedCharges.count ?? 0) > 0 || (memoryRules.count ?? 0) > 0;
}

export async function deletePerson(id: string): Promise<void> {
  const { error } = await supabase.from('people').delete().eq('id', id);
  if (error) throw error;
}
