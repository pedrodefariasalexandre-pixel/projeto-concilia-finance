import { describe, expect, it } from 'vitest';
import { checkReimport, computeStatementSignature, type ClosedMonthFingerprint } from './signature';
import type { MergedTransaction } from './merge';

function merged(overrides: Partial<MergedTransaction>): MergedTransaction {
  return {
    fitid: 'F1',
    amountCents: -1000,
    description: 'Compra',
    postedOn: '2026-07-05',
    installment: null,
    mergePending: false,
    ...overrides,
  };
}

describe('computeStatementSignature', () => {
  it('é determinística: mesma lista gera a mesma assinatura', async () => {
    const transactions = [merged({ fitid: 'A' }), merged({ fitid: 'B', amountCents: -500 })];
    const sig1 = await computeStatementSignature(transactions);
    const sig2 = await computeStatementSignature(transactions);
    expect(sig1).toBe(sig2);
  });

  it('é independente da ordem das transações', async () => {
    const a = merged({ fitid: 'A' });
    const b = merged({ fitid: 'B', amountCents: -500 });
    const sig1 = await computeStatementSignature([a, b]);
    const sig2 = await computeStatementSignature([b, a]);
    expect(sig1).toBe(sig2);
  });

  it('muda quando um valor muda', async () => {
    const sig1 = await computeStatementSignature([merged({ amountCents: -1000 })]);
    const sig2 = await computeStatementSignature([merged({ amountCents: -1001 })]);
    expect(sig1).not.toBe(sig2);
  });
});

describe('checkReimport', () => {
  it('bloqueia (correspondência total) quando a assinatura já existe no histórico', async () => {
    const transactions = [merged({ fitid: 'A' })];
    const signature = await computeStatementSignature(transactions);
    const history: ClosedMonthFingerprint[] = [
      { competency: '2026-06', signature, itemKeys: transactions.map((t) => `${t.fitid}|${t.amountCents}|${t.description}`) },
    ];
    const result = await checkReimport(transactions, history);
    expect(result.exactMatch).toEqual({ competency: '2026-06' });
    expect(result.partialMatch).toBeNull();
  });

  it('só avisa (correspondência parcial) quando mais da metade dos itens já apareceu antes', async () => {
    const oldTransactions = [merged({ fitid: 'A' }), merged({ fitid: 'B', amountCents: -500 })];
    const history: ClosedMonthFingerprint[] = [
      {
        competency: '2026-06',
        signature: 'outra-assinatura-qualquer',
        itemKeys: oldTransactions.map((t) => `${t.fitid}|${t.amountCents}|${t.description}`),
      },
    ];
    const newTransactions = [
      merged({ fitid: 'A' }),
      merged({ fitid: 'B', amountCents: -500 }),
      merged({ fitid: 'C', amountCents: -999 }),
    ];
    const result = await checkReimport(newTransactions, history);
    expect(result.exactMatch).toBeNull();
    expect(result.partialMatch?.competency).toBe('2026-06');
  });

  it('não avisa nem bloqueia quando o arquivo é genuinamente novo', async () => {
    const history: ClosedMonthFingerprint[] = [
      { competency: '2026-06', signature: 'xyz', itemKeys: ['OUTRO|-1|Outra coisa'] },
    ];
    const result = await checkReimport([merged({ fitid: 'NOVO' })], history);
    expect(result.exactMatch).toBeNull();
    expect(result.partialMatch).toBeNull();
  });
});
