import { useState } from 'react';
import { formatCents, parseAmountToCents } from '../domain/money';

type MoneyInputProps = {
  id: string;
  initialCents: number | null;
  onChange: (cents: number | null) => void;
  disabled?: boolean;
  ariaInvalid?: boolean;
  ariaDescribedBy?: string;
};

function centsToText(cents: number | null): string {
  if (cents === null) return '';
  return formatCents(cents).replace('R$', '').trim();
}

/**
 * Entrada de valor em reais que reporta centavos inteiros via money.ts (parseAmountToCents).
 * `initialCents` só é usado para semear o texto inicial — o componente fica não controlado
 * depois disso, para não sobrescrever o que a pessoa está digitando a cada tecla. Quando o
 * formulário pai troca de registro (novo ↔ editando outro item), passe uma `key` diferente
 * para forçar remount e ressemear o valor inicial.
 */
export function MoneyInput({ id, initialCents, onChange, disabled, ariaInvalid, ariaDescribedBy }: MoneyInputProps) {
  const [text, setText] = useState(() => centsToText(initialCents));

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      placeholder="0,00"
      value={text}
      disabled={disabled}
      onChange={(event) => {
        const raw = event.target.value;
        setText(raw);
        onChange(parseAmountToCents(raw));
      }}
      onBlur={() => {
        const cents = parseAmountToCents(text);
        setText(centsToText(cents));
      }}
      aria-invalid={ariaInvalid ? true : undefined}
      aria-describedby={ariaDescribedBy}
    />
  );
}
