import { describe, expect, it } from 'vitest';
import { parseOfx, resolveCompetency } from './ofx';

const SGML_SEM_FECHAMENTO = `
OFXHEADER:100
DATA:OFXSGML
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<DTSTART>20260701
<DTEND>20260731
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260705
<TRNAMT>-59.90
<FITID>202607050001
<MEMO>Netflix.com
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260710
<TRNAMT>-120.00
<FITID>202607100002
<NAME>Mercado Central
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;

const XML_STYLE = `<?xml version="1.0"?>
<OFX>
  <BANKTRANLIST>
    <DTSTART>20260601</DTSTART>
    <DTEND>20260630</DTEND>
    <STMTTRN>
      <TRNTYPE>DEBIT</TRNTYPE>
      <DTPOSTED>20260615</DTPOSTED>
      <TRNAMT>-35.00</TRNAMT>
      <FITID>ABC123</FITID>
      <MEMO>Padaria</MEMO>
    </STMTTRN>
  </BANKTRANLIST>
</OFX>`;

describe('parseOfx', () => {
  it('interpreta SGML sem fechamento de tag', () => {
    const result = parseOfx(SGML_SEM_FECHAMENTO);
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]).toMatchObject({
      fitid: '202607050001',
      amountCents: -5990,
      description: 'Netflix.com',
      postedOn: '2026-07-05',
    });
  });

  it('interpreta OFX no estilo XML com tags fechadas', () => {
    const result = parseOfx(XML_STYLE);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({
      fitid: 'ABC123',
      amountCents: -3500,
      description: 'Padaria',
    });
  });

  it('tolera BOM no início do arquivo', () => {
    const withBom = '﻿' + XML_STYLE;
    const result = parseOfx(withBom);
    expect(result.transactions).toHaveLength(1);
  });

  it('usa NAME como fallback quando MEMO está ausente', () => {
    const result = parseOfx(SGML_SEM_FECHAMENTO);
    expect(result.transactions[1]!.description).toBe('Mercado Central');
  });

  it('descarta transação de valor zero', () => {
    const withZero = SGML_SEM_FECHAMENTO.replace('-120.00', '0.00');
    const result = parseOfx(withZero);
    expect(result.transactions).toHaveLength(1);
  });

  it('gera chave estável quando FITID está ausente', () => {
    const semFitid = XML_STYLE.replace('<FITID>ABC123</FITID>', '');
    const result = parseOfx(semFitid);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]!.fitid).toContain('Padaria');
  });

  it('lê DTSTART/DTEND da BANKTRANLIST', () => {
    const result = parseOfx(SGML_SEM_FECHAMENTO);
    expect(result.competencyStart).toBe('2026-07-01');
    expect(result.competencyEnd).toBe('2026-07-31');
  });

  it('retorna lista vazia pra arquivo sem transação', () => {
    const result = parseOfx('<OFX></OFX>');
    expect(result.transactions).toEqual([]);
  });
});

describe('resolveCompetency', () => {
  it('usa DTEND quando presente', () => {
    const result = parseOfx(SGML_SEM_FECHAMENTO);
    expect(resolveCompetency(result)).toBe('2026-07');
  });

  it('cai pro mês mais frequente quando não há DTSTART/DTEND', () => {
    const semCompetencia = XML_STYLE
      .replace('<DTSTART>20260601</DTSTART>', '')
      .replace('<DTEND>20260630</DTEND>', '');
    const result = parseOfx(semCompetencia);
    expect(resolveCompetency(result)).toBe('2026-06');
  });

  it('retorna null quando não há dado suficiente', () => {
    const result = parseOfx('<OFX></OFX>');
    expect(resolveCompetency(result)).toBeNull();
  });
});
