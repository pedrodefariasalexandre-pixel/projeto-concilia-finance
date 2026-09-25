// Todo valor monetário do domínio trafega em CENTAVOS INTEIROS. Nunca float como fonte de verdade.
export type Cents = number;

export function isIntegerCents(value: number): value is Cents {
  return Number.isInteger(value);
}

/** Divide um valor em N partes iguais sem perder nem sobrar centavo.
 * O resto é distribuído de forma determinística: sempre para as primeiras partes, nessa ordem. */
export function splitEqual(totalCents: Cents, parts: number): Cents[] {
  if (!Number.isInteger(totalCents)) throw new Error('splitEqual exige centavos inteiros');
  if (!Number.isInteger(parts) || parts <= 0) throw new Error('splitEqual exige ao menos 1 parte');
  const sign = totalCents < 0 ? -1 : 1;
  const abs = Math.abs(totalCents);
  const base = Math.floor(abs / parts);
  const remainder = abs - base * parts;
  const shares: Cents[] = [];
  for (let i = 0; i < parts; i++) {
    shares.push(sign * (base + (i < remainder ? 1 : 0)));
  }
  return shares;
}

export function sumCents(values: Cents[]): Cents {
  return values.reduce((total, value) => total + value, 0);
}

/** Converte string monetária ("-1.234,56", "-1234.56", "1234,5") em centavos inteiros. */
export function parseAmountToCents(raw: string): Cents | null {
  if (typeof raw !== 'string') return null;
  let text = raw.trim().replace(/\s|R\$| /gi, '');
  if (!text) return null;

  let sign = 1;
  if (text.startsWith('-')) {
    sign = -1;
    text = text.slice(1);
  } else if (text.startsWith('+')) {
    text = text.slice(1);
  }

  if (text.includes(',') && text.includes('.')) {
    text = text.lastIndexOf(',') > text.lastIndexOf('.')
      ? text.replace(/\./g, '').replace(',', '.')
      : text.replace(/,/g, '');
  } else if (text.includes(',')) {
    text = text.replace(',', '.');
  }

  // Só 0-2 casas decimais: o domínio é centavos inteiros, sem correção silenciosa
  // (requisito §"Dinheiro em centavos inteiros") — 3+ casas não têm representação exata,
  // então são rejeitadas (null), nunca arredondadas ou truncadas silenciosamente.
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const wholePart = match[1]!;
  const fractionPart = (match[2] ?? '').padEnd(2, '0');
  const cents = Number(wholePart) * 100 + Number(fractionPart);
  if (!Number.isFinite(cents)) return null;
  return sign * cents;
}

export function formatCents(cents: Cents): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const reais = Math.floor(abs / 100).toLocaleString('pt-BR');
  const centavos = String(abs % 100).padStart(2, '0');
  return `${sign}R$ ${reais},${centavos}`;
}
