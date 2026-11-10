import { describe, it, expect } from 'vitest';
import { redact, maskValue, isPlausibleIcDate } from '../src/redact';

describe('redact – IC numbers', () => {
  it('redacts dashed IC', () => {
    const r = redact('No. KP: 900101-14-5678.');
    expect(r.text).toBe('No. KP: [IC].');
    expect(r.items).toHaveLength(1);
    expect(r.items[0].type).toBe('ic');
    expect(r.items[0].original).toBe('900101-14-5678');
  });
  it('redacts IC without dashes', () => {
    expect(redact('IC 900101145678 ok').text).toBe('IC [IC] ok');
  });
  it('redacts IC with spaces', () => {
    expect(redact('900101 14 5678').text).toBe('[IC]');
  });
  it('treats 12 digits with an impossible birth date as an account, not IC', () => {
    const r = redact('Akaun 220012345678');
    expect(r.text).toBe('Akaun [ACCOUNT]');
    expect(r.items[0].type).toBe('account');
  });
  it('masks the IC preview', () => {
    expect(redact('900101-14-5678').items[0].preview).toBe('900101-••-••78');
  });
});

describe('redact – phone numbers', () => {
  it.each([
    ['012-3456789'], ['012-345 6789'], ['011-23456789'], ['0123456789'],
    ['+60 12-345 6789'], ['+6012-3456789'], ['+60123456789'], ['+603-2345 6789'],
  ])('redacts %s', (p) => {
    const r = redact(`Tel: ${p}.`);
    expect(r.text).toBe('Tel: [PHONE].');
    expect(r.items[0].type).toBe('phone');
  });
});

describe('redact – account numbers', () => {
  it('redacts runs longer than 8 digits', () => {
    expect(redact('Akaun 123456789').text).toBe('Akaun [ACCOUNT]');
  });
  it('keeps 8-digit numbers', () => {
    expect(redact('Ref 12345678').text).toBe('Ref 12345678');
  });
  it('redacts grouped account numbers', () => {
    expect(redact('A/C 1234-5678-9012').text).toBe('A/C [ACCOUNT]');
    expect(redact('A/C 1234 5678 9012').text).toBe('A/C [ACCOUNT]');
  });
});

describe('redact – leaves useful facts alone', () => {
  it('keeps amounts, dates, short references and alphanumeric reference numbers', () => {
    const t = 'Bayar RM150.00 sebelum 2026-11-27 (27/11/2026). No. Saman: KPP12345678901. Seksyen 79(2).';
    const r = redact(t);
    expect(r.text).toBe(t);
    expect(r.items).toHaveLength(0);
  });
  it('handles multiple items in one letter', () => {
    const r = redact('Nama: ALI BIN CONTOH, KP 900101-14-5678, Tel 012-345 6789, Akaun 220012345678');
    expect(r.items.map((i) => i.type)).toEqual(['ic', 'phone', 'account']);
    expect(r.text).not.toMatch(/\d{6,}/);
  });
});

describe('helpers', () => {
  it('maskValue keeps separators', () => {
    expect(maskValue('012-345 6789', 3, 2)).toBe('012-••• ••89');
  });
  it('isPlausibleIcDate', () => {
    expect(isPlausibleIcDate('900101')).toBe(true);
    expect(isPlausibleIcDate('901301')).toBe(false);
    expect(isPlausibleIcDate('220012')).toBe(false);
  });
});

import { readFileSync } from 'node:fs';
describe('sample letters', () => {
  it.each(['saman-pdrm', 'lhdn-notis', 'tnb-bil'])('%s: removes IC + phone, keeps reference no. and amounts', (name) => {
    const t = readFileSync(`samples/${name}.txt`, 'utf8');
    const r = redact(t);
    expect(r.text).not.toContain('900101');
    expect(r.text).not.toMatch(/(?<!\w)(\+60|01\d)[\s-]?\d{3}/);
    expect(r.items.some((i) => i.type === 'ic')).toBe(true);
    expect(r.items.some((i) => i.type === 'phone')).toBe(true);
    expect(r.text).toMatch(/RM\d/);
  });
  it('TNB account number and LHDN bank account are redacted; LHDN file ref and saman no. kept', () => {
    expect(redact(readFileSync('samples/tnb-bil.txt', 'utf8')).text).toContain('No. Akaun: [ACCOUNT]');
    const l = redact(readFileSync('samples/lhdn-notis.txt', 'utf8')).text;
    expect(l).toContain('bayaran: [ACCOUNT]');
    expect(l).toContain('SG 12345678-09');
    expect(redact(readFileSync('samples/saman-pdrm.txt', 'utf8')).text).toContain('KPP12345678901');
  });
});
