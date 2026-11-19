/**
 * Phone numbers are 10 digits everywhere a person is entered by hand.
 *
 * Inputs are filtered as they are typed, so a user cannot produce an invalid
 * value from the UI; `phoneError` exists for pasted / imported values and for
 * the "not enough digits yet" case. A phone is optional - an empty value is
 * accepted and stored as null.
 */
export const PHONE_LENGTH = 10;

/** Keep only digits, capped at 10 - safe to call on every keystroke. */
export function phoneDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, PHONE_LENGTH);
}

/** Validation message for a phone field, or undefined when it is acceptable. */
export function phoneError(value: string): string | undefined {
  const digits = value.replace(/\D/g, '');
  if (digits === '') return undefined;
  return digits.length === PHONE_LENGTH ? undefined : `Enter a ${PHONE_LENGTH}-digit phone number`;
}
