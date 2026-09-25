import { supabase } from './supabaseClient';
import type { ClosedMonthFingerprint } from '../domain/signature';

type ClosedMonthRow = {
  competency: string;
  signature: string;
  item_keys: string[];
};

const COLUMNS = 'competency, signature, item_keys';

function toDomain(row: ClosedMonthRow): ClosedMonthFingerprint {
  return { competency: row.competency, signature: row.signature, itemKeys: row.item_keys };
}

/** R4: fingerprints dos meses já fechados, usados por checkReimport pra bloquear/avisar reimportação. */
export async function listClosedMonthFingerprints(userId: string): Promise<ClosedMonthFingerprint[]> {
  const { data, error } = await supabase.from('closed_months').select(COLUMNS).eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map(toDomain);
}
