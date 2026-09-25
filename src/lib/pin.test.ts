import { describe, expect, it } from 'vitest';
import { validatePinFormat } from './pin';

describe('validatePinFormat', () => {
  it('aceita PINs numéricos de 4 a 6 dígitos', () => {
    expect(validatePinFormat('1234')).toBe(true);
    expect(validatePinFormat('123456')).toBe(true);
  });

  it('rejeita PINs curtos, longos ou não numéricos', () => {
    expect(validatePinFormat('123')).toBe(false);
    expect(validatePinFormat('1234567')).toBe(false);
    expect(validatePinFormat('12a4')).toBe(false);
    expect(validatePinFormat('')).toBe(false);
  });
});
