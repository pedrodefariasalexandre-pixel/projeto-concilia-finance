import type { Cents } from './money';
import { buildMemoryKey } from './normalize';

export interface MemoryRule {
  id: string;
  key: string; // normalizeDescription(descrição) + '|' + valor exato — nunca FITID
  sampleDescription: string;
  amountCents: Cents;
  personIds: string[];
  categoryId: string | null;
}

export interface MemoryMatch {
  personIds: string[];
  categoryId: string | null;
}

/** Aplica a memória a um lançamento: por nome normalizado + valor exato (R2). */
export function matchMemoryRule(
  description: string,
  amountCents: Cents,
  rules: MemoryRule[],
): MemoryMatch | null {
  const key = buildMemoryKey(description, amountCents);
  if (!key) return null;
  const rule = rules.find((r) => r.key === key);
  if (!rule) return null;
  return { personIds: rule.personIds, categoryId: rule.categoryId };
}

/** Cria/atualiza uma regra a partir de um lançamento marcado como "lembrar".
 * Nunca cria regra pra descrição que normaliza pra string vazia. */
export function upsertMemoryRule(
  rules: MemoryRule[],
  description: string,
  amountCents: Cents,
  personIds: string[],
  categoryId: string | null,
  newId: () => string,
): MemoryRule[] {
  const key = buildMemoryKey(description, amountCents);
  if (!key || personIds.length === 0) return rules;

  const existing = rules.find((r) => r.key === key);
  if (existing) {
    return rules.map((r) => (r.key === key ? { ...r, personIds, categoryId, sampleDescription: description } : r));
  }

  return [...rules, { id: newId(), key, sampleDescription: description, amountCents, personIds, categoryId }];
}

/** Remove uma regra específica pelo id (edição/exclusão individual — nunca só "apagar tudo"). */
export function removeMemoryRule(rules: MemoryRule[], ruleId: string): MemoryRule[] {
  return rules.filter((r) => r.id !== ruleId);
}

/** Remove referências a uma pessoa excluída, sem apagar a regra inteira se ainda sobrar alguém. */
export function removePersonFromRules(rules: MemoryRule[], personId: string): MemoryRule[] {
  return rules
    .map((r) => ({ ...r, personIds: r.personIds.filter((id) => id !== personId) }))
    .filter((r) => r.personIds.length > 0);
}
