import { describe, expect, it } from 'vitest';
import { checkGrossSum, suggestIgnored } from './reconcile';
import { mergeByFitid } from './merge';
import type { RawTransaction } from './ofx';
import type { MergedTransaction } from './merge';

function tx(overrides: Partial<RawTransaction>): RawTransaction {
  return { fitid: 'F1', amountCents: -1000, description: 'Compra', postedOn: '2026-07-05', ...overrides };
}

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

describe('checkGrossSum', () => {
  it('bate quando o merge preserva a soma total', () => {
    const raw = [tx({ fitid: 'A', amountCents: -1000 }), tx({ fitid: 'B', amountCents: -150, description: 'IOF' })];
    const result = checkGrossSum(raw, mergeByFitid(raw));
    expect(result.matches).toBe(true);
    expect(result.differenceCents).toBe(0);
  });

  it('acusa diferença quando a lista processada perde dinheiro', () => {
    const raw = [tx({ fitid: 'A', amountCents: -1000 }), tx({ fitid: 'B', amountCents: -2000 })];
    const merged = mergeByFitid(raw).slice(0, 1); // simula item perdido
    const result = checkGrossSum(raw, merged);
    expect(result.matches).toBe(false);
    expect(result.differenceCents).toBe(2000);
  });
});

describe('suggestIgnored', () => {
  it('sugere ignorar lançamento de sinal oposto ao majoritário (pagamento de fatura)', () => {
    const transactions = [
      merged({ amountCents: -1000, description: 'Compra 1' }),
      merged({ amountCents: -2000, description: 'Compra 2' }),
      merged({ amountCents: -3000, description: 'Compra 3' }),
      merged({ amountCents: 6000, description: 'Pagamento recebido' }),
    ];
    expect(suggestIgnored(transactions)).toEqual([false, false, false, true]);
  });

  it('sugere ignorar por palavra-chave mesmo com sinal igual ao majoritário', () => {
    const transactions = [
      merged({ amountCents: -1000, description: 'Compra 1' }),
      merged({ amountCents: -500, description: 'Estorno de compra' }),
    ];
    expect(suggestIgnored(transactions)).toEqual([false, true]);
  });

  it('não sugere ignorar compra normal', () => {
    const transactions = [merged({ amountCents: -1000, description: 'Padaria' })];
    expect(suggestIgnored(transactions)).toEqual([false]);
  });
});
