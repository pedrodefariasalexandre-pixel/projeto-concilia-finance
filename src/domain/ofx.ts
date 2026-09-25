import { parseAmountToCents, type Cents } from './money';

export interface RawTransaction {
  fitid: string;
  amountCents: Cents;
  description: string;
  postedOn: string | null; // 'YYYY-MM-DD'
}

export interface ParsedStatement {
  transactions: RawTransaction[];
  competencyStart: string | null; // 'YYYY-MM-DD', do <DTSTART>
  competencyEnd: string | null; // 'YYYY-MM-DD', do <DTEND>
}

function grabTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i'));
  return match ? match[1]!.trim() : '';
}

function ofxDateToIso(ofxDate: string): string | null {
  const match = ofxDate.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/** Parser tolerante: aceita OFX SGML sem fechamento de tag, XML, BOM, CRLF/LF. */
export function parseOfx(rawText: string): ParsedStatement {
  const text = rawText.replace(/^﻿/, '');

  const dtStartMatch = text.match(/<DTSTART>(\d{8})/i);
  const dtEndMatch = text.match(/<DTEND>(\d{8})/i);

  const blocks = text.split(/<STMTTRN>/i).slice(1);
  const transactions: RawTransaction[] = [];

  for (const rawBlock of blocks) {
    const block = rawBlock.split(/<\/STMTTRN>/i)[0]!;
    const amountRaw = grabTag(block, 'TRNAMT');
    const amountCents = parseAmountToCents(amountRaw);
    if (amountCents === null || amountCents === 0) continue;

    const description = grabTag(block, 'MEMO') || grabTag(block, 'NAME') || '(sem descrição)';
    const postedRaw = grabTag(block, 'DTPOSTED');
    const postedOn = postedRaw ? ofxDateToIso(postedRaw) : null;
    const fitidRaw = grabTag(block, 'FITID');
    // sem FITID: chave estável derivada de data + valor + descrição
    const fitid = fitidRaw || `${postedRaw}|${amountRaw}|${description}`;

    transactions.push({ fitid, amountCents, description, postedOn });
  }

  return {
    transactions,
    competencyStart: dtStartMatch ? ofxDateToIso(dtStartMatch[1]!) : null,
    competencyEnd: dtEndMatch ? ofxDateToIso(dtEndMatch[1]!) : null,
  };
}

/** Competência (AAAA-MM) do extrato: usa DTEND quando presente; senão, o mês mais frequente entre as transações. */
export function resolveCompetency(statement: ParsedStatement): string | null {
  if (statement.competencyEnd) return statement.competencyEnd.slice(0, 7);

  const monthFrequency = new Map<string, number>();
  for (const tx of statement.transactions) {
    if (!tx.postedOn) continue;
    const yearMonth = tx.postedOn.slice(0, 7);
    monthFrequency.set(yearMonth, (monthFrequency.get(yearMonth) ?? 0) + 1);
  }

  let bestMonth: string | null = null;
  let bestCount = 0;
  for (const [yearMonth, count] of monthFrequency) {
    if (count > bestCount) {
      bestMonth = yearMonth;
      bestCount = count;
    }
  }
  return bestMonth;
}
