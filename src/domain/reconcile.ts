import { sumCents, type Cents } from './money';
import type { MergedTransaction } from './merge';
import type { RawTransaction } from './ofx';

export interface GrossSumCheck {
  matches: boolean;
  differenceCents: Cents;
  rawCount: number;
  mergedCount: number;
}

/** R5: confere que o merge por FITID não perdeu nem criou dinheiro em relação ao arquivo bruto. */
export function checkGrossSum(raw: RawTransaction[], merged: MergedTransaction[]): GrossSumCheck {
  const rawSum = sumCents(raw.map((tx) => tx.amountCents));
  const mergedSum = sumCents(merged.map((tx) => tx.amountCents));
  return {
    matches: rawSum === mergedSum,
    differenceCents: mergedSum - rawSum,
    rawCount: raw.length,
    mergedCount: merged.length,
  };
}

const PAYMENT_PATTERN = /PAGAMENTO|ESTORNO|CREDITO DE|AJUSTE/i;

/** R6: sugestão inicial de classificação (usuário sempre pode reverter).
 * Sinal oposto ao majoritário do arquivo, ou descrição de pagamento/estorno/crédito/ajuste, entram sugeridos como ignorados. */
export function suggestIgnored(transactions: MergedTransaction[]): boolean[] {
  const negativeCount = transactions.filter((tx) => tx.amountCents < 0).length;
  const buySign = negativeCount >= transactions.length - negativeCount ? -1 : 1;

  return transactions.map((tx) => {
    const isOppositeSign = Math.sign(tx.amountCents) !== buySign && tx.amountCents !== 0;
    const looksLikePayment = PAYMENT_PATTERN.test(tx.description);
    return isOppositeSign || looksLikePayment;
  });
}
