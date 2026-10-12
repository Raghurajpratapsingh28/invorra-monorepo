import Decimal from 'decimal.js';

export function decimalToString(value: Decimal | number | string): string {
  return new Decimal(value).toFixed(2);
}

export function toDecimal(value: Decimal | number | string): Decimal {
  return new Decimal(value);
}
