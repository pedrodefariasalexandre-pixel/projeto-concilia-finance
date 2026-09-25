import type { MergedTransaction } from './merge';

/** R4: assinatura da lista ordenada e canônica de (FITID, valor, descrição) pós-merge.
 * Usada pra bloquear reimportação de um arquivo já fechado. */
export async function computeStatementSignature(transactions: MergedTransaction[]): Promise<string> {
  const canonicalLines = transactions
    .map((tx) => `${tx.fitid}|${tx.amountCents}|${tx.description.trim()}`)
    .sort();
  const canonical = canonicalLines.join('\n');
  const data = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export interface ReimportCheck {
  /** assinatura idêntica já existe no histórico: bloqueia por padrão. */
  exactMatch: { competency: string } | null;
  /** mais da metade dos itens do arquivo novo já apareceu em algum mês fechado: só avisa. */
  partialMatch: { competency: string; overlapRatio: number } | null;
}

export interface ClosedMonthFingerprint {
  competency: string;
  signature: string;
  itemKeys: string[]; // mesma chave canônica usada na assinatura, uma por transação daquele mês
}

/** Mesma chave canônica usada internamente pela assinatura — exportada pra quem precisar
 * reconstruir um fingerprint comparável a partir de dados já persistidos (nunca duplicar este formato). */
export function itemKey(tx: MergedTransaction): string {
  return `${tx.fitid}|${tx.amountCents}|${tx.description.trim()}`;
}

/** Compara o arquivo recém-importado contra os meses já fechados. Nunca bloqueia sem oferecer "importar mesmo assim". */
export async function checkReimport(
  transactions: MergedTransaction[],
  closedMonths: ClosedMonthFingerprint[],
): Promise<ReimportCheck> {
  const signature = await computeStatementSignature(transactions);
  const exact = closedMonths.find((month) => month.signature === signature);
  if (exact) {
    return { exactMatch: { competency: exact.competency }, partialMatch: null };
  }

  const keys = new Set(transactions.map(itemKey));
  let bestPartial: { competency: string; overlapRatio: number } | null = null;
  for (const month of closedMonths) {
    const seenBefore = month.itemKeys.filter((key) => keys.has(key)).length;
    const ratio = keys.size === 0 ? 0 : seenBefore / keys.size;
    if (ratio > 0.5 && (!bestPartial || ratio > bestPartial.overlapRatio)) {
      bestPartial = { competency: month.competency, overlapRatio: ratio };
    }
  }

  return { exactMatch: null, partialMatch: bestPartial };
}
