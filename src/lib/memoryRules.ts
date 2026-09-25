import { supabase } from './supabaseClient';
import type { MemoryRule } from '../domain/rules';

type MemoryRuleRow = {
  id: string;
  rule_key: string;
  sample_description: string;
  amount_cents: number;
  category_id: string | null;
  person_ids: string[];
};

const COLUMNS = 'id, rule_key, sample_description, amount_cents, category_id, person_ids';

function toDomain(row: MemoryRuleRow): MemoryRule {
  return {
    id: row.id,
    key: row.rule_key,
    sampleDescription: row.sample_description,
    amountCents: row.amount_cents,
    personIds: row.person_ids,
    categoryId: row.category_id,
  };
}

export async function listMemoryRules(userId: string): Promise<MemoryRule[]> {
  const { data, error } = await supabase.from('memory_rules').select(COLUMNS).eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map(toDomain);
}
