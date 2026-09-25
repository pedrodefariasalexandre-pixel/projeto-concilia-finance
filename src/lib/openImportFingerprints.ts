import { supabase } from './supabaseClient';
import { computeStatementSignature, itemKey } from '../domain/signature';
import type { ClosedMonthFingerprint } from '../domain/signature';
import type { MergedTransaction } from '../domain/merge';

type ImportedTransactionRow = {
  competency: string | null;
  fitid: string | null;
  amount_cents: number;
  description: string;
};

const COLUMNS = 'competency, fitid, amount_cents, description';

/**
 * R4 para competências AINDA ABERTAS (sem closed_months, porque fechamento de mês não existe
 * nesta etapa): reconstrói, a partir das próprias `transactions` já persistidas com source='ofx',
 * o mesmo fingerprint {signature, itemKeys} que closed_months teria depois de fechado — usando
 * exatamente computeStatementSignature/itemKey do domínio, nunca um hash paralelo. Sem isso, reimportar
 * o mesmo extrato antes de fechar o mês não seria detectado.
 */
export async function listOpenImportFingerprints(userId: string): Promise<ClosedMonthFingerprint[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select(COLUMNS)
    .eq('user_id', userId)
    .eq('source', 'ofx');
  if (error) throw error;

  const rows = (data ?? []) as ImportedTransactionRow[];
  const byCompetency = new Map<string, MergedTransaction[]>();

  for (const row of rows) {
    const competency = row.competency ?? '(sem competência)';
    const reconstructed: MergedTransaction = {
      fitid: row.fitid ?? '',
      amountCents: row.amount_cents,
      description: row.description,
      postedOn: null,
      installment: null,
      mergePending: false,
    };
    const list = byCompetency.get(competency) ?? [];
    list.push(reconstructed);
    byCompetency.set(competency, list);
  }

  const fingerprints: ClosedMonthFingerprint[] = [];
  for (const [competency, transactions] of byCompetency) {
    fingerprints.push({
      competency,
      signature: await computeStatementSignature(transactions),
      itemKeys: transactions.map(itemKey),
    });
  }

  return fingerprints;
}
