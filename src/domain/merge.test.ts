import { describe, expect, it } from 'vitest';
import { detectInstallment, mergeByFitid } from './merge';
import type { RawTransaction } from './ofx';

function tx(overrides: Partial<RawTransaction>): RawTransaction {
  return {
    fitid: 'F1',
    amountCents: -1000,
    description: 'Compra',
    postedOn: '2026-07-05',
    ...overrides,
  };
}

describe('detectInstallment', () => {
  it('reconhece "parc 2/10"', () => {
    expect(detectInstallment('Loja Parc 2/10')).toEqual({ current: 2, total: 10 });
  });

  it('reconhece "parcela 2/10" por extenso', () => {
    expect(detectInstallment('Loja Parcela 02/10')).toEqual({ current: 2, total: 10 });
  });

  it('reconhece "2/10" solto no fim, sem a palavra parcela', () => {
    expect(detectInstallment('Loja X - 2/10')).toEqual({ current: 2, total: 10 });
  });

  it('não confunde data "06/18" no fim com parcela (sem a palavra "parc")', () => {
    expect(detectInstallment('Compra em 06/18')).toBeNull();
  });

  it('rejeita parcela atual maior que o total', () => {
    expect(detectInstallment('Loja Parc 12/10')).toBeNull();
  });

  it('rejeita total fora da faixa 2-48', () => {
    expect(detectInstallment('Loja Parc 1/1')).toBeNull();
    expect(detectInstallment('Loja Parc 2/60')).toBeNull();
  });

  it('retorna null quando não há parcela', () => {
    expect(detectInstallment('Padaria São José')).toBeNull();
  });
});

describe('mergeByFitid', () => {
  it('mantém transação única quando o FITID não se repete', () => {
    const result = mergeByFitid([tx({ fitid: 'A', amountCents: -5000 })]);
    expect(result).toHaveLength(1);
    expect(result[0]!.amountCents).toBe(-5000);
    expect(result[0]!.mergePending).toBe(false);
  });

  it('soma 2 linhas com mesmo FITID (compra + IOF), descrição vem da linha que não é encargo', () => {
    const result = mergeByFitid([
      tx({ fitid: 'B', amountCents: -10000, description: 'Compra Loja X' }),
      tx({ fitid: 'B', amountCents: -150, description: 'IOF' }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.amountCents).toBe(-10150);
    expect(result[0]!.description).toBe('Compra Loja X');
    expect(result[0]!.mergePending).toBe(false);
    expect(result[0]!.sourceLines).toHaveLength(2);
  });

  it('soma 3 linhas com mesmo FITID (compra + juros + multa)', () => {
    const result = mergeByFitid([
      tx({ fitid: 'C', amountCents: -20000, description: 'Compra Loja Y' }),
      tx({ fitid: 'C', amountCents: -300, description: 'Juros' }),
      tx({ fitid: 'C', amountCents: -100, description: 'Multa' }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.amountCents).toBe(-20400);
    expect(result[0]!.description).toBe('Compra Loja Y');
  });

  it('não mescla grupo de 4+ linhas — marca todas como pendente de revisão', () => {
    const result = mergeByFitid([
      tx({ fitid: 'D', amountCents: -1000, description: 'Linha 1' }),
      tx({ fitid: 'D', amountCents: -100, description: 'Linha 2' }),
      tx({ fitid: 'D', amountCents: -100, description: 'Linha 3' }),
      tx({ fitid: 'D', amountCents: -100, description: 'Linha 4' }),
    ]);
    expect(result).toHaveLength(4);
    expect(result.every((line) => line.mergePending)).toBe(true);
  });

  it('preserva a soma total do arquivo mesmo depois do merge', () => {
    const raw = [
      tx({ fitid: 'X', amountCents: -10000, description: 'Compra' }),
      tx({ fitid: 'X', amountCents: -150, description: 'IOF' }),
      tx({ fitid: 'Y', amountCents: -5000, description: 'Outra compra' }),
    ];
    const merged = mergeByFitid(raw);
    const rawTotal = raw.reduce((sum, t) => sum + t.amountCents, 0);
    const mergedTotal = merged.reduce((sum, t) => sum + t.amountCents, 0);
    expect(mergedTotal).toBe(rawTotal);
  });

  it('parcela detectada vem da linha principal, não da linha de encargo', () => {
    const result = mergeByFitid([
      tx({ fitid: 'Z', amountCents: -10000, description: 'Loja Parc 3/12' }),
      tx({ fitid: 'Z', amountCents: -150, description: 'IOF' }),
    ]);
    expect(result[0]!.installment).toEqual({ current: 3, total: 12 });
  });
});
