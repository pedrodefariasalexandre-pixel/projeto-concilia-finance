import { describe, expect, it } from 'vitest';
import { buildMemoryKey, normalizeDescription } from './normalize';

describe('normalizeDescription', () => {
  it('remove acento e caixa', () => {
    expect(normalizeDescription('Padaria São José')).toBe('PADARIA SAO JOSE');
  });

  it('remove número de parcela com ou sem a palavra', () => {
    expect(normalizeDescription('Loja X Parc 2/10')).toBe('LOJA X');
    expect(normalizeDescription('Loja X 2/10')).toBe('LOJA X');
  });

  it('remove data no meio da descrição', () => {
    expect(normalizeDescription('Compra 06/18 Mercado')).toBe('COMPRA MERCADO');
  });

  it('remove id numérico longo', () => {
    expect(normalizeDescription('PIX 000123456789 Fulano')).toBe('PIX FULANO');
  });

  it('remove pontuação e espaço repetido', () => {
    expect(normalizeDescription('Uber* - Trip:   1234')).toBe('UBER TRIP');
  });

  it('descrição equivalente em meses diferentes gera a mesma chave', () => {
    const a = normalizeDescription('Netflix.com Parc 2/12');
    const b = normalizeDescription('NETFLIX.COM parc 3/12');
    expect(a).toBe(b);
  });
});

describe('buildMemoryKey', () => {
  it('combina descrição normalizada com valor exato', () => {
    expect(buildMemoryKey('Netflix', 3990)).toBe('NETFLIX|3990');
  });

  it('não gera chave quando a normalização fica vazia', () => {
    expect(buildMemoryKey('12/10', 100)).toBeNull();
  });

  it('mesma descrição com valor diferente gera chave diferente (reajuste de assinatura)', () => {
    const key1 = buildMemoryKey('Netflix', 3990);
    const key2 = buildMemoryKey('Netflix', 4490);
    expect(key1).not.toBe(key2);
  });
});
