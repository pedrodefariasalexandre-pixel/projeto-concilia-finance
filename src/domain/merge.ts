import { sumCents, type Cents } from './money';
import type { RawTransaction } from './ofx';

export interface Installment {
  current: number;
  total: number;
}

export interface MergedTransaction {
  fitid: string;
  amountCents: Cents;
  description: string;
  postedOn: string | null;
  installment: Installment | null;
  /** true quando o grupo de FITID tinha 4+ linhas e por isso NÃO foi mesclado automaticamente. */
  mergePending: boolean;
  /** linhas originais quando este item é resultado de merge de 2-3 linhas (encargo + compra). */
  sourceLines?: { description: string; amountCents: Cents }[];
}

const CHARGE_PATTERN = /IOF|JUROS|MULTA|ENCARGO/i;

/** Reconhece "parc 2/10", "parcela 2/10", "2/10" no fim da descrição.
 * Sem a palavra "parc", exige que não comece com zero, pra não confundir com data tipo "06/18". */
export function detectInstallment(description: string): Installment | null {
  let match = description.match(/parc(?:ela)?\.?\s*(\d{1,2})\s*\/\s*(\d{1,2})\b/i);
  if (!match) {
    match = description.trim().match(/[\s\-–]([1-9]\d?)\s*\/\s*(\d{1,2})$/);
  }
  if (!match) return null;

  const current = Number(match[1]);
  const total = Number(match[2]);
  if (total < 2 || total > 48) return null;
  if (current < 1 || current > total) return null;
  return { current, total };
}

/** Agrupa por FITID bruto ANTES de qualquer outro processamento (R1).
 * Grupo de 2-3 linhas: soma automática, descrição vem da linha que não é encargo.
 * Grupo de 4+ linhas: não mescla, cada linha fica marcada como pendente pra revisão manual. */
export function mergeByFitid(transactions: RawTransaction[]): MergedTransaction[] {
  const groups = new Map<string, RawTransaction[]>();
  const order: string[] = [];

  for (const tx of transactions) {
    if (!groups.has(tx.fitid)) {
      groups.set(tx.fitid, []);
      order.push(tx.fitid);
    }
    groups.get(tx.fitid)!.push(tx);
  }

  const result: MergedTransaction[] = [];

  for (const fitid of order) {
    const lines = groups.get(fitid)!;

    if (lines.length === 1) {
      const line = lines[0]!;
      result.push({
        fitid,
        amountCents: line.amountCents,
        description: line.description,
        postedOn: line.postedOn,
        installment: detectInstallment(line.description),
        mergePending: false,
      });
      continue;
    }

    if (lines.length >= 4) {
      for (const line of lines) {
        result.push({
          fitid,
          amountCents: line.amountCents,
          description: line.description,
          postedOn: line.postedOn,
          installment: detectInstallment(line.description),
          mergePending: true,
        });
      }
      continue;
    }

    // 2 ou 3 linhas: soma automática
    const mainLine = lines.find((line) => !CHARGE_PATTERN.test(line.description)) ?? lines[0]!;
    result.push({
      fitid,
      amountCents: sumCents(lines.map((line) => line.amountCents)),
      description: mainLine.description,
      postedOn: mainLine.postedOn,
      installment: detectInstallment(mainLine.description),
      mergePending: false,
      sourceLines: lines.map((line) => ({ description: line.description, amountCents: line.amountCents })),
    });
  }

  return result;
}
