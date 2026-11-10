/**
 * Privacy redaction run on-device BEFORE anything is sent to the cloud.
 * Covers Malaysian IC (MyKad) numbers, Malaysian phone numbers and long
 * account numbers (> 8 digits).
 */
export type RedactionType = 'ic' | 'phone' | 'account';

export interface RedactionItem {
  type: RedactionType;
  /** The original value (kept only in memory on the device, never sent). */
  original: string;
  /** A partially masked preview safe to show on screen, e.g. 900101-**-**78 */
  preview: string;
  /** The placeholder that replaced it in the text sent to the cloud. */
  placeholder: string;
}

export interface RedactionResult {
  text: string;
  items: RedactionItem[];
}

const PLACEHOLDER: Record<RedactionType, string> = {
  ic: '[IC]',
  phone: '[PHONE]',
  account: '[ACCOUNT]',
};

const digitsOnly = (s: string) => s.replace(/\D/g, '');

/** True when the first 6 digits look like a valid YYMMDD birth date. */
export function isPlausibleIcDate(digits: string): boolean {
  if (digits.length < 6) return false;
  const mm = Number(digits.slice(2, 4));
  const dd = Number(digits.slice(4, 6));
  return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31;
}

/** Mask all but the first `keepStart` and last `keepEnd` digits, keeping separators. */
export function maskValue(value: string, keepStart = 2, keepEnd = 2): string {
  const total = digitsOnly(value).length;
  let seen = 0;
  return value.replace(/\d/g, (d) => {
    seen += 1;
    return seen <= keepStart || seen > total - keepEnd ? d : '•';
  });
}

interface Rule {
  type: RedactionType;
  re: RegExp;
  accept?: (match: string) => boolean;
}

// Order matters: IC first, then phones, then generic long numbers.
const RULES: Rule[] = [
  // IC with dashes or spaces: 900101-14-5678 / 900101 14 5678
  { type: 'ic', re: /(?<![\d-])\d{6}[- ]\d{2}[- ]\d{4}(?![\d-])/g },
  // IC without separators: 900101145678 (only if YYMMDD is a plausible date)
  { type: 'ic', re: /(?<!\d)\d{12}(?!\d)/g, accept: (m) => isPlausibleIcDate(m) },
  // International format: +60 12-345 6789, +603-2345 6789, +60123456789
  { type: 'phone', re: /\+\s?60[\s-]?\d{1,2}[\s-]?\d{3,4}[\s-]?\d{4}(?!\d)/g },
  // Local mobile: 012-3456789, 012-345 6789, 011-23456789, 0123456789
  { type: 'phone', re: /(?<![\d+])01\d[\s-]?\d{3,4}[\s-]?\d{4}(?!\d)/g },
  // Grouped account numbers: 1234-5678-9012, 1234 5678 9012
  {
    type: 'account',
    re: /(?<![\w-])\d{3,6}(?:[ -]\d{3,6}){1,4}(?![\w-])/g,
    accept: (m) => digitsOnly(m).length > 8 && !/\d{4}-\d{2}-\d{2}/.test(m),
  },
  // Plain long digit runs: more than 8 digits
  // (letters glued to digits = a reference number like KPP12345678901, which we keep)
  { type: 'account', re: /(?<![\w])\d{9,}(?![\w])/g },
];

export function redact(input: string): RedactionResult {
  let text = input;
  const items: RedactionItem[] = [];
  for (const rule of RULES) {
    text = text.replace(rule.re, (match) => {
      if (rule.accept && !rule.accept(match)) return match;
      const placeholder = PLACEHOLDER[rule.type];
      items.push({
        type: rule.type,
        original: match,
        preview: rule.type === 'ic' ? maskValue(match, 6, 2) : maskValue(match, 3, 2),
        placeholder,
      });
      return placeholder;
    });
  }
  return { text, items };
}
