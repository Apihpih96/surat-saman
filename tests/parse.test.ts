import { describe, it, expect } from 'vitest';
import { parseAnalysis, extractJson, ParseError } from '../src/parse';

const NOW = new Date('2026-11-10T11:11:00Z');
const good = {
  letter_type: 'Traffic summons', sender: 'PDRM', summary: 'You were caught speeding.',
  key_facts: [{ label: 'Amount', value: 'RM150' }], deadline: '2026-11-27', days_left: 99,
  next_steps: ['Pay via MyBayar PDRM'], urgency: 'low', language: 'en',
};

describe('extractJson', () => {
  it('parses plain JSON', () => expect(extractJson('{"a":1}')).toEqual({ a: 1 }));
  it('strips code fences', () => expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 }));
  it('ignores chatter around the object', () => expect(extractJson('Sure! {"a":1} hope that helps')).toEqual({ a: 1 }));
  it('throws ParseError on garbage', () => expect(() => extractJson('no json here')).toThrow(ParseError));
});

describe('parseAnalysis', () => {
  it('recomputes days_left from the deadline instead of trusting the model', () => {
    const r = parseAnalysis(JSON.stringify(good), 'en', NOW);
    expect(r.days_left).toBe(17);
    expect(r.deadline).toBe('2026-11-27');
  });
  it('raises urgency when the deadline is near', () => {
    const r = parseAnalysis(JSON.stringify({ ...good, deadline: '2026-11-12' }), 'en', NOW);
    expect(r.urgency).toBe('high');
  });
  it('handles missing deadline', () => {
    const r = parseAnalysis(JSON.stringify({ ...good, deadline: '' }), 'en', NOW);
    expect(r.deadline).toBeNull();
    expect(r.days_left).toBeNull();
  });
  it('accepts key_facts as "label: value" strings', () => {
    const r = parseAnalysis(JSON.stringify({ ...good, key_facts: ['Amaun: RM150', 'just a note'] }), 'ms', NOW);
    expect(r.key_facts).toEqual([{ label: 'Amaun', value: 'RM150' }, { label: '', value: 'just a note' }]);
  });
  it('falls back on bad enums and language', () => {
    const r = parseAnalysis(JSON.stringify({ ...good, urgency: 'URGENT!!', language: 'xx', deadline: '' }), 'ms', NOW);
    expect(r.urgency).toBe('medium');
    expect(r.language).toBe('ms');
  });
  it('rejects output with no summary', () => {
    expect(() => parseAnalysis(JSON.stringify({ ...good, summary: '' }), 'en', NOW)).toThrow(ParseError);
  });
  it('rejects arrays', () => {
    expect(() => parseAnalysis('[1,2]', 'en', NOW)).toThrow(ParseError);
  });
});

describe('result polish', () => {
  const base = { letter_type: 'tax notice', sender: 'LHDN', summary: 'S', deadline: '', urgency: 'low', language: 'en', next_steps: [] };
  it('capitalises the letter type', () => {
    expect(parseAnalysis(JSON.stringify({ ...base, key_facts: [] }), 'en').letter_type).toBe('Tax notice');
  });
  it('hides key facts that are only redaction placeholders', () => {
    const r = parseAnalysis(JSON.stringify({ ...base, key_facts: [
      { label: 'IC Number', value: '[IC]' }, { label: 'Phone', value: '[PHONE]' },
      { label: 'Contact', value: '[PHONE], [ACCOUNT]' }, { label: 'Amount', value: 'RM512.00' },
      { label: 'Pay to', value: 'Account [ACCOUNT] at Maybank' },
    ] }), 'en');
    expect(r.key_facts.map((f) => f.label)).toEqual(['Amount', 'Pay to']);
  });
});
