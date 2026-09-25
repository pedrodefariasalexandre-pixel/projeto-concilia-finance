import { describe, expect, it } from 'vitest';
import { formatCents, parseAmountToCents, splitEqual, sumCents } from './money';

describe('splitEqual', () => {
  it('divide para uma pessoa sem alterar o valor', () => {
    expect(splitEqual(10000, 1)).toEqual([10000]);
  });

  it('divide igualmente entre duas pessoas', () => {
    expect(splitEqual(10000, 2)).toEqual([5000, 5000]);
  });

  it('distribui o resto de forma determinística entre três pessoas', () => {
    expect(splitEqual(10000, 3)).toEqual([3334, 3333, 3333]);
  });

  it('não perde nem cria centavo com valor de 1 centavo para duas pessoas', () => {
    expect(splitEqual(1, 2)).toEqual([1, 0]);
  });

  it('a soma das partes é sempre igual ao total original, para qualquer N de 1 a 12', () => {
    const total = 123457;
    for (let parts = 1; parts <= 12; parts++) {
      const shares = splitEqual(total, parts);
      expect(sumCents(shares)).toBe(total);
      expect(shares).toHaveLength(parts);
    }
  });

  it('preserva o sinal em valores negativos (estorno dividido)', () => {
    expect(splitEqual(-100, 3)).toEqual([-34, -33, -33]);
  });

  it('rejeita valor não inteiro', () => {
    expect(() => splitEqual(10.5, 2)).toThrow();
  });

  it('rejeita zero ou menos partes', () => {
    expect(() => splitEqual(1000, 0)).toThrow();
  });
});

describe('parseAmountToCents', () => {
  it('interpreta vírgula como separador decimal (formato brasileiro)', () => {
    expect(parseAmountToCents('1.234,56')).toBe(123456);
  });

  it('interpreta ponto como separador decimal (formato OFX cru)', () => {
    expect(parseAmountToCents('-1234.56')).toBe(-123456);
  });

  it('interpreta valor sem separador de milhar', () => {
    expect(parseAmountToCents('1234,5')).toBe(123450);
  });

  it('interpreta prefixo R$ e espaços', () => {
    expect(parseAmountToCents('R$ 99,90')).toBe(9990);
  });

  it('retorna null para texto inválido', () => {
    expect(parseAmountToCents('abc')).toBeNull();
    expect(parseAmountToCents('')).toBeNull();
  });

  it('rejeita (null) valores com mais de 2 casas decimais, nunca arredonda ou trunca silenciosamente', () => {
    expect(parseAmountToCents('0,994')).toBeNull();
    expect(parseAmountToCents('0,995')).toBeNull();
    expect(parseAmountToCents('1,004')).toBeNull();
    expect(parseAmountToCents('1,005')).toBeNull();
    expect(parseAmountToCents('-0,994')).toBeNull();
    expect(parseAmountToCents('-0,995')).toBeNull();
    expect(parseAmountToCents('-59.905')).toBeNull(); // formato OFX cru (ponto) com 3 casas
  });

  it('continua aceitando 0, 1 ou 2 casas decimais normalmente', () => {
    expect(parseAmountToCents('1234')).toBe(123400);
    expect(parseAmountToCents('1234,5')).toBe(123450);
    expect(parseAmountToCents('-59.90')).toBe(-5990); // formato OFX cru (ponto)
  });
});

describe('formatCents', () => {
  it('formata em pt-BR com R$', () => {
    expect(formatCents(123456)).toBe('R$ 1.234,56');
  });

  it('formata negativo', () => {
    expect(formatCents(-500)).toBe('-R$ 5,00');
  });

  it('formata zero', () => {
    expect(formatCents(0)).toBe('R$ 0,00');
  });
});
