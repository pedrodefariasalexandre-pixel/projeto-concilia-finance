import { supabase } from './supabaseClient';
import type { Cents } from '../domain/money';

export type ImportPersonShare = {
  personId: string;
  shareCents: Cents;
};

export type ImportTransactionInput = {
  accountId: string;
  competency: string | null;
  postedOn: string | null;
  amountCents: Cents;
  description: string;
  descriptionNorm: string;
  fitid: string | null;
  installmentCurrent: number | null;
  installmentTotal: number | null;
  categoryId: string | null;
  ignored: boolean;
  mergePending: boolean;
  fromMemory: boolean;
  people: ImportPersonShare[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Grava toda a importação (transações + rateios) em uma única transação de banco via RPC
 * (0003_import_ofx_transactions.sql) — evita ficar com a importação parcialmente gravada
 * se uma linha falhar no meio. user_id nunca é enviado: a RPC usa auth.uid() da sessão.
 */
export async function importOfxTransactions(transactions: ImportTransactionInput[]): Promise<{ inserted: number }> {
  const payload = transactions.map((tx) => ({
    account_id: tx.accountId,
    competency: tx.competency,
    posted_on: tx.postedOn,
    amount_cents: tx.amountCents,
    description: tx.description,
    description_norm: tx.descriptionNorm,
    fitid: tx.fitid,
    installment_current: tx.installmentCurrent,
    installment_total: tx.installmentTotal,
    category_id: tx.categoryId,
    ignored: tx.ignored,
    merge_pending: tx.mergePending,
    from_memory: tx.fromMemory,
    people: tx.people.map((p) => ({ person_id: p.personId, share_cents: p.shareCents })),
  }));

  const { data, error } = await supabase.rpc('import_ofx_transactions', { payload });
  if (error) throw error;
  if (!isRecord(data) || typeof data.inserted !== 'number') {
    throw new Error('Resposta inesperada do servidor (import_ofx_transactions).');
  }
  return { inserted: data.inserted };
}
