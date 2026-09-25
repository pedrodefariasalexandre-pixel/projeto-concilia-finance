import type { Cents } from './money';

/** Normaliza descrição de lançamento pra fins de memória/regra:
 * remove acento, caixa, número de parcela, data, ID numérico longo, pontuação e espaço repetido. */
export function normalizeDescription(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/(?:PARC(?:ELA)?\.?\s*)?\d{1,2}\s*\/\s*\d{1,2}\b/g, ' ')
    .replace(/\d{2}[/\-.]\d{2}(?:[/\-.]\d{2,4})?/g, ' ')
    .replace(/\b\d{4,}\b/g, ' ')
    .replace(/[*#\-–_.,:;()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Chave de regra de memória: nome normalizado + valor exato (nunca FITID — FITID não se repete entre meses). */
export function buildMemoryKey(description: string, amountCents: Cents): string | null {
  const normalized = normalizeDescription(description);
  if (!normalized) return null;
  return `${normalized}|${amountCents}`;
}
