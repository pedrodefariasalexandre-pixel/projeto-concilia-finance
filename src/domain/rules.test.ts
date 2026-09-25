import { describe, expect, it } from 'vitest';
import { matchMemoryRule, removeMemoryRule, removePersonFromRules, upsertMemoryRule, type MemoryRule } from './rules';

let counter = 0;
const newId = () => `rule-${++counter}`;

describe('upsertMemoryRule + matchMemoryRule', () => {
  it('cria regra e aplica em lançamento equivalente em outro mês', () => {
    let rules: MemoryRule[] = [];
    rules = upsertMemoryRule(rules, 'Netflix.com', 3990, ['pedro'], 'streaming', newId);
    const match = matchMemoryRule('NETFLIX.COM', 3990, rules);
    expect(match).toEqual({ personIds: ['pedro'], categoryId: 'streaming' });
  });

  it('número da parcela muda mas a regra continua válida', () => {
    let rules: MemoryRule[] = [];
    rules = upsertMemoryRule(rules, 'Loja X Parc 1/10', 10000, ['pedro'], 'compras', newId);
    const match = matchMemoryRule('Loja X Parc 2/10', 10000, rules);
    expect(match?.personIds).toEqual(['pedro']);
  });

  it('data muda mas a regra continua válida', () => {
    let rules: MemoryRule[] = [];
    rules = upsertMemoryRule(rules, 'Compra 06/18 Mercado', 5000, ['nega'], null, newId);
    const match = matchMemoryRule('Compra 07/19 Mercado', 5000, rules);
    expect(match?.personIds).toEqual(['nega']);
  });

  it('valor diferente não aciona a regra (reajuste de assinatura exige nova tag manual)', () => {
    let rules: MemoryRule[] = [];
    rules = upsertMemoryRule(rules, 'Netflix', 3990, ['pedro'], null, newId);
    expect(matchMemoryRule('Netflix', 4490, rules)).toBeNull();
  });

  it('não cria regra quando a normalização fica vazia', () => {
    const rules = upsertMemoryRule([], '12/10', 100, ['pedro'], null, newId);
    expect(rules).toEqual([]);
  });

  it('não cria regra sem pessoa selecionada', () => {
    const rules = upsertMemoryRule([], 'Padaria', 1000, [], null, newId);
    expect(rules).toEqual([]);
  });

  it('atualiza a regra existente em vez de duplicar', () => {
    let rules: MemoryRule[] = [];
    rules = upsertMemoryRule(rules, 'Netflix', 3990, ['pedro'], null, newId);
    rules = upsertMemoryRule(rules, 'Netflix', 3990, ['nega'], 'streaming', newId);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.personIds).toEqual(['nega']);
    expect(rules[0]!.categoryId).toBe('streaming');
  });
});

describe('removeMemoryRule', () => {
  it('remove só a regra escolhida, não todas', () => {
    let rules: MemoryRule[] = [];
    rules = upsertMemoryRule(rules, 'Netflix', 3990, ['pedro'], null, newId);
    rules = upsertMemoryRule(rules, 'Spotify', 1990, ['nega'], null, newId);
    const remaining = removeMemoryRule(rules, rules[0]!.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.sampleDescription).toBe('Spotify');
  });
});

describe('removePersonFromRules', () => {
  it('remove a pessoa excluída sem quebrar a aplicação; regra sem ninguém desaparece', () => {
    let rules: MemoryRule[] = [];
    rules = upsertMemoryRule(rules, 'Netflix', 3990, ['pedro', 'nega'], null, newId);
    rules = upsertMemoryRule(rules, 'Spotify', 1990, ['pedro'], null, newId);
    const remaining = removePersonFromRules(rules, 'pedro');
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.personIds).toEqual(['nega']);
  });
});
