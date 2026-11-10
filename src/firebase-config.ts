/**
 * Firebase web config. These are PUBLIC client identifiers (not secrets), but they are
 * still read from VITE_ env vars so no project values are hard-coded in the repo.
 * Copy .env.example to .env.local and fill in the values from
 * Firebase console > Project settings > Your apps > Web app.
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, ReCaptchaV3Provider } from 'firebase/app-check';


export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'YOUR_API_KEY',                       // PLACEHOLDER
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? 'surat-saman.firebaseapp.com', // PLACEHOLDER
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'surat-saman',                   // PLACEHOLDER
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? 'surat-saman.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? 'YOUR_SENDER_ID',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? 'YOUR_APP_ID',                           // PLACEHOLDER
};

/** reCAPTCHA site key for App Check (PLACEHOLDER until the web app is registered with App Check). */
export const appCheckSiteKey: string = import.meta.env.VITE_RECAPTCHA_SITE_KEY ?? '';
/** 'enterprise' (default, recommended) or 'v3' */
export const appCheckProvider: string = import.meta.env.VITE_APPCHECK_PROVIDER ?? 'enterprise';
/** Local dev only: a debug token registered in Firebase console, or "true" to have one generated. */
// Guarded by DEV so a real debug token is never inlined into a production bundle.
const appCheckDebugToken: string = import.meta.env.DEV ? (import.meta.env.VITE_APPCHECK_DEBUG_TOKEN ?? '') : '';

/** Optional override for the cloud fallback model (SDK default: gemini-3.5-flash-lite). */
export const cloudModelName: string | undefined = import.meta.env.VITE_CLOUD_MODEL || undefined;

export const isConfigured = !String(firebaseConfig.apiKey).startsWith('YOUR_');

export interface FirebaseSetup { app: FirebaseApp; appCheck: 'recaptcha' | 'debug' | 'off' }

export function initFirebase(): FirebaseSetup {
  const app = initializeApp(firebaseConfig);
  let appCheck: FirebaseSetup['appCheck'] = 'off';

  // App Check is REQUIRED for Firebase AI Logic (enforced from 2 Nov 2026).
  // In dev, set the debug token BEFORE initializeAppCheck so the debug provider is used.
  if (import.meta.env.DEV && appCheckDebugToken) {
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      appCheckDebugToken === 'true' ? true : appCheckDebugToken;
    appCheck = 'debug';
  }

  if (appCheckSiteKey || appCheck === 'debug') {
    // With a debug token the provider is bypassed, but initializeAppCheck still needs one.
    const key = appCheckSiteKey || 'debug-mode-no-site-key';
    const provider = appCheckProvider === 'v3' ? new ReCaptchaV3Provider(key) : new ReCaptchaEnterpriseProvider(key);
    initializeAppCheck(app, { provider, isTokenAutoRefreshEnabled: true });
    if (appCheck === 'off') appCheck = 'recaptcha';
  } else {
    console.warn('[Surat Saman] App Check not initialised: set VITE_RECAPTCHA_SITE_KEY (prod) or VITE_APPCHECK_DEBUG_TOKEN (dev). Cloud requests will be rejected while App Check is enforced. On-device inference still works.');
  }
  return { app, appCheck };
}
