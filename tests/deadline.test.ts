import { describe, it, expect } from 'vitest';
import { daysLeft, normalizeDeadline, todayInMalaysia, adjustUrgency, describeDaysLeft } from '../src/deadline';

// 2026-11-10 19:11 in Malaysia == 11:11 UTC
const NOW = new Date('2026-11-10T11:11:00Z');

describe('todayInMalaysia', () => {
  it('uses Malaysia date, not UTC', () => {
    // 2026-11-10 17:30 UTC is already 2026-11-11 01:30 in KL
    expect(todayInMalaysia(new Date('2026-11-10T17:30:00Z'))).toBe('2026-11-11');
    expect(todayInMalaysia(NOW)).toBe('2026-11-10');
  });
});

describe('normalizeDeadline', () => {
  it.each([
    ['2026-11-27', '2026-11-27'],
    ['2026-11-27T00:00:00Z', '2026-11-27'],
    ['27/11/2026', '2026-11-27'],
    ['7-1-2027', '2027-01-07'],
    ['27.11.2026', '2026-11-27'],
  ])('%s -> %s', (i, o) => expect(normalizeDeadline(i)).toBe(o));
  it.each([[''], ['null'], ['none'], ['Tiada'], ['2026-02-30'], ['soon'], [null], [42]])('rejects %s', (i) => {
    expect(normalizeDeadline(i as unknown)).toBeNull();
  });
});

describe('daysLeft', () => {
  it('counts calendar days in Malaysia time', () => {
    expect(daysLeft('2026-11-27', NOW)).toBe(17);
    expect(daysLeft('2026-11-10', NOW)).toBe(0);
    expect(daysLeft('2026-11-11', NOW)).toBe(1);
  });
  it('is negative when overdue', () => {
    expect(daysLeft('2026-11-01', NOW)).toBe(-9);
  });
  it('crosses year boundary', () => {
    expect(daysLeft('2027-01-01', NOW)).toBe(52);
  });
  it('null when no deadline', () => {
    expect(daysLeft(null, NOW)).toBeNull();
  });
});

describe('urgency + labels', () => {
  it('raises urgency near the deadline', () => {
    expect(adjustUrgency('low', 3)).toBe('high');
    expect(adjustUrgency('low', 14)).toBe('medium');
    expect(adjustUrgency('low', 60)).toBe('low');
    expect(adjustUrgency('high', null)).toBe('high');
  });
  it('describes days left in both languages', () => {
    expect(describeDaysLeft(5, 'ms')).toBe('5 hari lagi');
    expect(describeDaysLeft(5, 'en')).toBe('5 days left');
    expect(describeDaysLeft(-1, 'en')).toBe('1 day overdue');
    expect(describeDaysLeft(0, 'ms')).toBe('Hari ini!');
  });
});
