import { adjustUrgency, daysLeft, normalizeDeadline, type Urgency } from './deadline';

export interface KeyFact { label: string; value: string }

export interface LetterAnalysis {
  letter_type: string;
  sender: string;
  summary: string;
  key_facts: KeyFact[];
  deadline: string | null;
  days_left: number | null;
  next_steps: string[];
  urgency: Urgency;
  language: 'ms' | 'en';
}

export class ParseError extends Error {}

/** Pull the first JSON object out of a model reply (handles ```json fences and chatter). */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) throw new ParseError('No JSON object in model output');
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch (e) {
    throw new ParseError(`Invalid JSON in model output: ${(e as Error).message}`);
  }
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

function toFacts(v: unknown): KeyFact[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((f): KeyFact[] => {
    if (typeof f === 'string') {
      const i = f.indexOf(':');
      return f.trim() ? [i > 0 ? { label: f.slice(0, i).trim(), value: f.slice(i + 1).trim() } : { label: '', value: f.trim() }] : [];
    }
    if (f && typeof f === 'object') {
      const o = f as Record<string, unknown>;
      const fact = { label: str(o.label ?? o.name ?? o.key), value: str(o.value ?? o.detail) };
      return fact.label || fact.value ? [fact] : [];
    }
    return [];
  }).filter((f) => !isOnlyRedacted(f.value));
}

/** True when a value is nothing but redaction placeholders like "[IC]" (the model echoing hidden numbers). */
export function isOnlyRedacted(value: string): boolean {
  const rest = value.replace(/\[(?:IC|PHONE|ACCOUNT)\]/g, '').replace(/[\s,;/&-]|dan|and/gi, '');
  return rest === '' && /\[(?:IC|PHONE|ACCOUNT)\]/.test(value);
}

/** Capitalise the first letter (e.g. "tax notice" -> "Tax notice"); leaves the rest as the model wrote it. */
export function capitalizeFirst(s: string): string {
  return s ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : s;
}

/**
 * Turn raw model text into a validated LetterAnalysis.
 * days_left is always recomputed on-device from the deadline (models are bad at date maths),
 * and urgency is raised if the deadline is close.
 */
export function parseAnalysis(raw: string, fallbackLang: 'ms' | 'en', now: Date = new Date()): LetterAnalysis {
  const data = extractJson(raw);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ParseError('Model output is not an object');
  const o = data as Record<string, unknown>;
  const summary = str(o.summary);
  if (!summary) throw new ParseError('Model output has no summary');
  const deadline = normalizeDeadline(o.deadline);
  const dl = daysLeft(deadline, now);
  const u = str(o.urgency).toLowerCase();
  const urgency: Urgency = u === 'high' || u === 'medium' || u === 'low' ? u : 'medium';
  const lang = str(o.language).toLowerCase();
  return {
    letter_type: capitalizeFirst(str(o.letter_type)) || '—',
    sender: capitalizeFirst(str(o.sender)) || '—',
    summary,
    key_facts: toFacts(o.key_facts),
    deadline,
    days_left: dl,
    next_steps: Array.isArray(o.next_steps) ? o.next_steps.map(str).filter(Boolean) : [],
    urgency: adjustUrgency(urgency, dl),
    language: lang === 'ms' || lang === 'en' ? lang : fallbackLang,
  };
}
