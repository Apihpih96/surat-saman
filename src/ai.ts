/**
 * Firebase AI Logic – hybrid inference.
 *
 *  • privateModel  – InferenceMode.PREFER_ON_DEVICE. Runs Gemini Nano in Chrome via the
 *                    Prompt API. We only call it after confirming the on-device model is
 *                    "available" (see deviceStatus), so the SDK's automatic cloud fallback
 *                    never fires with un-redacted data. inferenceSource on each response
 *                    proves where it ran and drives the badge.
 *  • cloudModel    – InferenceMode.ONLY_IN_CLOUD. Used ONLY after the user taps "Use cloud",
 *                    and only with text that has been redacted on-device first.
 *
 * Both share one JSON schema: responseConstraint on-device, responseSchema in the cloud.
 */
import {
  getAI, getGenerativeModel, GoogleAIBackend, InferenceMode, InferenceSource,
  type GenerativeModel, type Part, type LanguageModelCreateOptions,
} from 'firebase/ai';
import { initFirebase, cloudModelName } from './firebase-config';
import { letterSchema } from './schema';
import { parseAnalysis, type LetterAnalysis } from './parse';
import { todayInMalaysia } from './deadline';

export type Lang = 'ms' | 'en';
export type Source = 'on_device' | 'in_cloud';
export type DeviceStatus = 'available' | 'downloadable' | 'downloading' | 'unavailable';

const SYSTEM = `You explain official Malaysian letters (LHDN tax, PDRM/JPJ summons, TNB/utility bills, bank letters, local council notices) to ordinary people in plain, calm language. Be accurate: only state facts that appear in the letter. Never invent amounts, dates or reference numbers. Placeholders like [IC], [PHONE] or [ACCOUNT] mean the value was hidden for privacy; refer to them as hidden.`;

// The Prompt API is asked for text + image input, text output (SDK defaults are English text).
const deviceCreateOptions: LanguageModelCreateOptions = {
  expectedInputs: [{ type: 'text', languages: ['en'] }, { type: 'image' }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
  initialPrompts: [{ role: 'system', content: [{ type: 'text', value: SYSTEM }] }],
};

const DEFAULT_CLOUD_MODEL = 'gemini-3.5-flash-lite';

let privateModel: GenerativeModel | null = null;
let cloudModel: GenerativeModel | null = null;
export let appCheckMode: 'recaptcha' | 'debug' | 'off' = 'off';

function init() {
  if (privateModel && cloudModel) return;
  const { app, appCheck } = initFirebase();
  appCheckMode = appCheck;
  const ai = getAI(app, { backend: new GoogleAIBackend() }); // Gemini Developer API (Spark plan friendly)

  const inCloudParams = {
    // NOTE: once inCloudParams is given, `model` is mandatory (the SDK default
    // 'gemini-3.5-flash-lite' only applies when inCloudParams is omitted entirely).
    model: cloudModelName ?? DEFAULT_CLOUD_MODEL,
    systemInstruction: SYSTEM,
    generationConfig: { responseMimeType: 'application/json', responseSchema: letterSchema, temperature: 0.2 },
  };

  privateModel = getGenerativeModel(ai, {
    mode: InferenceMode.PREFER_ON_DEVICE,
    onDeviceParams: { createOptions: deviceCreateOptions, promptOptions: { responseConstraint: letterSchema } },
    inCloudParams,
  });
  cloudModel = getGenerativeModel(ai, { mode: InferenceMode.ONLY_IN_CLOUD, inCloudParams });
}

interface LanguageModelGlobal {
  availability(o?: unknown): Promise<DeviceStatus>;
}
const LM = () => (globalThis as unknown as { LanguageModel?: LanguageModelGlobal }).LanguageModel;

/** Is Gemini Nano usable in this browser right now? */
export async function deviceStatus(): Promise<DeviceStatus> {
  const lm = LM();
  if (!lm) return 'unavailable';
  try { return await lm.availability(deviceCreateOptions); } catch { return 'unavailable'; }
}

/**
 * Must be called from a user gesture. Starts the Gemini Nano download if needed and resolves
 * once the model is 'available' (or rejects when it can't be, or after the timeout).
 */
export async function prepareDevice(onProgress: (pct: number) => void, timeoutMs = 15 * 60_000): Promise<void> {
  init();
  void privateModel!.initializeDeviceModel((v) => onProgress(Math.round(v * 100)));
  const start = Date.now();
  for (;;) {
    const s = await deviceStatus();
    if (s === 'available') return;
    if (s === 'unavailable') throw new Error('device-unavailable');
    if (Date.now() - start > timeoutMs) throw new Error('device-timeout');
    await new Promise((r) => setTimeout(r, 1000));
  }
}

function buildPrompt(lang: Lang, hasImage: boolean, text: string): string {
  const out = lang === 'ms' ? 'Bahasa Melayu (simple, everyday Malay)' : 'simple English';
  return [
    `Today's date in Malaysia is ${todayInMalaysia()}.`,
    hasImage ? 'The attached photo is an official letter. Read it carefully.' : '',
    text ? `Letter text:\n"""\n${text.slice(0, 6000)}\n"""` : '',
    `Return JSON only. Write summary, key_facts labels/values and next_steps in ${out}; set "language" to "${lang}".`,
    'letter_type: short type. sender: agency/company. summary: 2-3 sentences on what it is and what it means for me.',
    'key_facts: amounts (with RM), reference/summons/account numbers, offence or bill period, dates.',
    'deadline: the single most important due date as YYYY-MM-DD, or "" if none. days_left: -1 (computed later).',
    'next_steps: 2-5 concrete actions in order (where/how to pay or respond, what to bring, who to contact).',
    'urgency: high if action is needed within 7 days or legal action/disconnection is threatened; otherwise medium or low.',
  ].filter(Boolean).join('\n');
}

export interface AnalysisResult { analysis: LetterAnalysis; source: Source; raw: string }

async function run(model: GenerativeModel, lang: Lang, text: string, image: Part | null): Promise<AnalysisResult> {
  const prompt = buildPrompt(lang, !!image, text);
  const result = await model.generateContent(image ? [prompt, image] : prompt);
  const raw = result.response.text();
  const source: Source = result.response.inferenceSource === InferenceSource.ON_DEVICE ? 'on_device' : 'in_cloud';
  return { analysis: parseAnalysis(raw, lang), source, raw };
}

/** Private path: caller must have confirmed deviceStatus() === 'available'. */
export async function analyzePrivately(lang: Lang, text: string, image: Part | null): Promise<AnalysisResult> {
  init();
  if ((await deviceStatus()) !== 'available') throw new Error('device-not-ready'); // guard against silent cloud fallback
  return run(privateModel!, lang, text, image);
}

/** Cloud path: `redactedText` must already be redacted. `image` only after explicit consent. */
export async function analyzeInCloud(lang: Lang, redactedText: string, image: Part | null): Promise<AnalysisResult> {
  init();
  return run(cloudModel!, lang, redactedText, image);
}
