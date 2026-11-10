import './style.css';
import type { Part } from 'firebase/ai';
import { T, type Lang } from './i18n';
import { SAMPLES } from './samples';
import { redact, type RedactionResult } from './redact';
import { describeDaysLeft } from './deadline';
import { fileToJpegPart } from './image';
import { isConfigured } from './firebase-config';
import type { LetterAnalysis } from './parse';
import type { AnalysisResult, DeviceStatus } from './ai';

// The AI module (Firebase SDK) is loaded lazily so the shell paints instantly.
const loadAI = () => import('./ai');

const $ = <E extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as E;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const state = {
  lang: (localStorage.getItem('lang') as Lang) || (navigator.language.startsWith('ms') ? 'ms' : 'en') as Lang,
  image: null as Part | null,
  imageUrl: '' as string,
  device: 'unavailable' as DeviceStatus,
  busy: false,
  last: null as AnalysisResult | null,
};
const t = () => T[state.lang];

// ---------- Static i18n ----------
function applyI18n() {
  document.documentElement.lang = state.lang;
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n as keyof typeof T.en;
    const v = t()[key];
    if (typeof v === 'string') el.textContent = v;
  });
  $<HTMLTextAreaElement>('#text').placeholder = t().placeholder;
  document.querySelectorAll<HTMLButtonElement>('.lang button').forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.lang === state.lang)));
  if (!state.busy) $('#analyze').textContent = t().analyze;
  renderSamples();
  renderDevice();
  if (state.last) renderResult(state.last);
}

function renderSamples() {
  $('#samples').innerHTML = SAMPLES.map((s) =>
    `<button type="button" class="chip" data-sample="${s.id}">${esc(s.label[state.lang])}</button>`).join('');
}

// ---------- Device status banner ----------
function renderDevice(progress?: number) {
  const el = $('#device');
  const s = state.device;
  if (progress !== undefined) {
    el.className = 'note info';
    el.innerHTML = `${esc(t().downloading)}… <b>${progress}%</b><div class="bar"><i style="width:${progress}%"></i></div>`;
    return;
  }
  if (s === 'available') {
    el.className = 'note ok';
    el.innerHTML = `<span class="dot"></span>${esc(t().privacyOn)}`;
  } else if (s === 'downloadable' || s === 'downloading') {
    el.className = 'note info';
    el.textContent = t().deviceDownloadable;
  } else {
    el.className = 'note warn';
    el.innerHTML = `${esc(t().deviceUnavailable)} <button type="button" class="link" data-action="cloud">${esc(t().useCloud)} →</button>`;
  }
}

// ---------- Input ----------
async function setImage(file: Blob) {
  const { part, dataUrl } = await fileToJpegPart(file);
  state.image = part;
  state.imageUrl = dataUrl;
  $('#preview').innerHTML = `<img src="${dataUrl}" alt=""><button type="button" class="x" data-action="rm-photo" aria-label="${esc(t().removePhoto)}">×</button>`;
  $('#preview').hidden = false;
}
function clearImage() {
  state.image = null; state.imageUrl = '';
  $('#preview').hidden = true; $('#preview').innerHTML = '';
}
const getText = () => $<HTMLTextAreaElement>('#text').value.trim();
const hasInput = () => !!state.image || !!getText();

async function loadSample(id: string) {
  const s = SAMPLES.find((x) => x.id === id)!;
  $<HTMLTextAreaElement>('#text').value = s.text;
  const blob = await (await fetch(s.image)).blob();
  await setImage(blob);
  $('#result').hidden = true;
}

// ---------- Analysis ----------
function setBusy(on: boolean, label: string = t().analyzing) {
  state.busy = on;
  const btn = $<HTMLButtonElement>('#analyze');
  btn.disabled = on;
  btn.innerHTML = on ? `<span class="spin"></span>${esc(label)}` : esc(t().analyze);
}

function showError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  let friendly = msg;
  if (/app.?check|attestation|403|401|PERMISSION|unauth/i.test(msg)) friendly = 'Cloud request rejected (App Check). See README: register a debug token or reCAPTCHA key.';
  if (msg === 'device-timeout') friendly = t().deviceTimeout;
  $('#result').hidden = false;
  $('#result').innerHTML = `<div class="note warn">${esc(t().error)} ${esc(friendly)}
    <div class="row"><button type="button" class="btn ghost" data-action="cloud">☁ ${esc(t().useCloud)}</button></div></div>`;
}

async function analyzeOnDevice() {
  if (!hasInput()) return showError(t().needInput);
  const ai = await loadAI();
  state.device = await ai.deviceStatus();
  if (state.device === 'unavailable') { renderDevice(); return openCloudSheet(); }
  setBusy(true);
  try {
    if (state.device !== 'available') {
      await ai.prepareDevice((p) => renderDevice(p)); // user gesture: we are inside the click handler chain
      state.device = 'available';
      renderDevice();
    }
    const res = await ai.analyzePrivately(state.lang, getText(), state.image);
    state.last = res;
    renderResult(res);
  } catch (e) {
    console.error(e);
    showError(e);
  } finally {
    setBusy(false);
  }
}

// ---------- Cloud consent + redaction sheet ----------
let pendingRedaction: RedactionResult | null = null;

function openCloudSheet() {
  if (!hasInput()) return showError(t().needInput);
  const text = getText();
  pendingRedaction = redact(text);
  const r = pendingRedaction;
  const items = r.items.length
    ? `<ul class="redactions">${r.items.map((i) =>
        `<li><span class="tag ${i.type}">${esc(t().redactType[i.type])}</span><s>${esc(i.preview)}</s> → <code>${esc(i.placeholder)}</code></li>`).join('')}</ul>`
    : `<p class="muted">${esc(t().redactNone)}</p>`;
  const photo = state.image
    ? `<div class="note warn small">${esc(text ? t().photoWarn : t().photoOnlyWarn)}
         <label class="check"><input type="checkbox" id="send-photo"> ${esc(t().sendPhoto)}</label></div>`
    : '';
  $('#sheet-body').innerHTML = `
    <h2>☁ ${esc(t().useCloud)}</h2>
    <p class="muted">${esc(t().cloudWhy)}</p>
    ${text ? `<h3>${esc(t().redactTitle)}</h3>${items}
      <details><summary>${esc(t().redactPreview)}</summary><pre>${esc(r.text)}</pre></details>` : ''}
    ${photo}
    <div class="row end">
      <button type="button" class="btn ghost" data-action="close-sheet">${esc(t().cancel)}</button>
      <button type="button" class="btn primary" id="send-cloud" ${!text ? 'disabled' : ''}>${esc(t().send)}</button>
    </div>`;
  const cb = document.getElementById('send-photo') as HTMLInputElement | null;
  cb?.addEventListener('change', () => { if (!text) $<HTMLButtonElement>('#send-cloud').disabled = !cb.checked; });
  $<HTMLDialogElement>('#sheet').showModal();
}

async function sendToCloud() {
  const includePhoto = (document.getElementById('send-photo') as HTMLInputElement | null)?.checked ?? false;
  const redactedText = pendingRedaction?.text ?? '';
  $<HTMLDialogElement>('#sheet').close();
  setBusy(true, '☁ …');
  try {
    const ai = await loadAI();
    const res = await ai.analyzeInCloud(state.lang, redactedText, includePhoto ? state.image : null);
    state.last = res;
    renderResult(res);
  } catch (e) {
    console.error(e);
    showError(e);
  } finally {
    setBusy(false);
  }
}

// ---------- Result ----------
function renderResult({ analysis: a, source }: AnalysisResult) {
  const L = t();
  const dl = describeDaysLeft(a.days_left, state.lang);
  const deadlineDate = a.deadline
    ? new Date(a.deadline + 'T00:00:00+08:00').toLocaleDateString(state.lang === 'ms' ? 'ms-MY' : 'en-MY', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' })
    : '';
  const badge = source === 'on_device'
    ? `<span class="badge device" title="inferenceSource: on_device">🔒 ${esc(L.onDevice)}</span>`
    : `<span class="badge cloud" title="inferenceSource: in_cloud">☁ ${esc(L.cloud)}</span>`;
  const el = $('#result');
  el.hidden = false;
  el.innerHTML = `
    <article class="card u-${a.urgency}">
      <header>
        <div class="badges">${badge}<span class="urg ${a.urgency}">${esc(L.urgency[a.urgency])}</span></div>
        <h2>${esc(a.letter_type)}</h2>
        <p class="muted">${esc(L.from)}: <b>${esc(a.sender)}</b></p>
      </header>
      <p class="summary">${esc(a.summary)}</p>
      <div class="deadline ${a.days_left !== null && a.days_left <= 7 ? 'soon' : ''}">
        <div><small>${esc(L.deadline)}</small><b>${esc(deadlineDate || '—')}</b></div>
        <div class="days">${esc(dl)}</div>
      </div>
      ${a.key_facts.length ? `<h3>${esc(L.keyFacts)}</h3><dl class="facts">${a.key_facts.map((f) =>
        `<div><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`).join('')}</dl>` : ''}
      ${a.next_steps.length ? `<h3>${esc(L.nextSteps)}</h3><ol class="steps">${a.next_steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
      <div class="row">
        <button type="button" class="btn ghost" data-action="copy">${esc(L.copy)}</button>
        ${source === 'on_device' ? `<button type="button" class="btn ghost" data-action="cloud">☁ ${esc(L.useCloud)}</button>` : ''}
      </div>
      <p class="disclaimer">${esc(L.disclaimer)}</p>
    </article>`;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function summaryText(a: LetterAnalysis) {
  return [`${a.letter_type} — ${a.sender}`, a.summary,
    a.deadline ? `${t().deadline}: ${a.deadline} (${describeDaysLeft(a.days_left, state.lang)})` : '',
    ...a.key_facts.map((f) => `• ${f.label}: ${f.value}`),
    ...a.next_steps.map((s, i) => `${i + 1}. ${s}`)].filter(Boolean).join('\n');
}

// ---------- Wiring ----------
document.addEventListener('click', async (ev) => {
  const target = ev.target as HTMLElement;
  const btn = target.closest<HTMLElement>('[data-action],[data-sample],[data-lang]');
  if (!btn) return;
  if (btn.dataset.lang) {
    state.lang = btn.dataset.lang as Lang;
    localStorage.setItem('lang', state.lang);
    return applyI18n();
  }
  if (btn.dataset.sample) return loadSample(btn.dataset.sample);
  switch (btn.dataset.action) {
    case 'cloud': return openCloudSheet();
    case 'close-sheet': return $<HTMLDialogElement>('#sheet').close();
    case 'rm-photo': return clearImage();
    case 'copy':
      if (state.last) { await navigator.clipboard.writeText(summaryText(state.last.analysis)); btn.textContent = t().copied; }
      return;
  }
});
$('#analyze').addEventListener('click', () => { if (!state.busy) void analyzeOnDevice(); });
$('#sheet').addEventListener('click', (e) => { if ((e.target as HTMLElement).id === 'send-cloud') void sendToCloud(); });
for (const id of ['#camera', '#file']) {
  $<HTMLInputElement>(id).addEventListener('change', async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) await setImage(f);
  });
}
window.addEventListener('online', () => ($('#offline').hidden = true));
window.addEventListener('offline', () => ($('#offline').hidden = false));
$('#offline').hidden = navigator.onLine;

applyI18n();
if (!isConfigured) console.warn('[Surat Saman] Firebase config missing: copy .env.example to .env.local');
loadAI().then(async (ai) => { state.device = await ai.deviceStatus(); renderDevice(); });

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}
