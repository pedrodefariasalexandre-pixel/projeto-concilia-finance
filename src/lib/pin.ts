export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 6;

const PIN_PATTERN = new RegExp(`^\\d{${PIN_MIN_LENGTH},${PIN_MAX_LENGTH}}$`);

/** Validação de formato só para UX — o servidor (verify_pin/set_pin) é a fonte final. */
export function validatePinFormat(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}
