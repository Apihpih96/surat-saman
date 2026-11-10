import { Schema } from 'firebase/ai';

/** One schema, used for BOTH on-device (responseConstraint) and cloud (responseSchema). */
export const letterSchema = Schema.object({
  properties: {
    letter_type: Schema.string({ description: 'e.g. traffic summons, tax notice, electricity bill, bank letter, council notice' }),
    sender: Schema.string({ description: 'The agency or company that sent the letter' }),
    summary: Schema.string({ description: '2-3 plain-language sentences' }),
    key_facts: Schema.array({
      items: Schema.object({
        properties: { label: Schema.string(), value: Schema.string() },
      }),
    }),
    deadline: Schema.string({ description: 'Main deadline as YYYY-MM-DD, or empty string if none' }),
    days_left: Schema.integer({ description: 'Days from today to the deadline; -1 if none' }),
    next_steps: Schema.array({ items: Schema.string() }),
    urgency: Schema.enumString({ enum: ['low', 'medium', 'high'] }),
    language: Schema.enumString({ enum: ['ms', 'en'] }),
  },
});
