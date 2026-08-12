// background/firebase.js — Firebase Realtime Database REST helpers
//
// The DB URL lives in chrome.storage.local (key: firebaseDbUrl) so it can be
// updated from the popup without editing source. Use setFirebaseUrl() on install
// to seed the initial value, then getFirebaseUrl() before every request.

let _cachedUrl = null;

export async function getFirebaseUrl() {
  if (_cachedUrl !== null) return _cachedUrl;
  return new Promise(resolve => {
    chrome.storage.local.get('firebaseDbUrl', result => {
      _cachedUrl = result.firebaseDbUrl || '';
      resolve(_cachedUrl);
    });
  });
}

export async function setFirebaseUrl(url) {
  _cachedUrl = url;
  return new Promise(resolve => chrome.storage.local.set({ firebaseDbUrl: url }, resolve));
}

// Firebase keys cannot contain . # $ / [ ]
export function wishlistDbKey(wishlistKey) {
  return wishlistKey.replace(/[.#$[\]/]/g, '_');
}

// All Firebase REST calls go through fetchWithTimeout so a stalled network
// request can't hang a message channel open forever (sendResponse would
// never fire, and the caller's promise waits indefinitely).
const REQUEST_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function getOrCreateUserId() {
  return new Promise(resolve => {
    chrome.storage.local.get('collabUserId', result => {
      if (result.collabUserId) { resolve(result.collabUserId); return; }
      const id = 'u_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
      chrome.storage.local.set({ collabUserId: id }, () => resolve(id));
    });
  });
}

export async function firebaseGet(path) {
  const base = await getFirebaseUrl();
  if (!base) return null;
  try {
    const res = await fetchWithTimeout(`${base}/${path}.json`);
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

export async function firebasePut(path, data) {
  const base = await getFirebaseUrl();
  if (!base) return { ok: false, error: 'Firebase URL not configured' };
  try {
    const res = await fetchWithTimeout(`${base}/${path}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn('[Firebase] PUT failed:', res.status, text);
      return { ok: false, status: res.status };
    }
    return { ok: true };
  } catch (e) {
    console.warn('[Firebase] PUT error:', e.message);
    return { ok: false, error: e.message };
  }
}

export async function firebaseDelete(path) {
  const base = await getFirebaseUrl();
  if (!base) return { ok: false, error: 'Firebase URL not configured' };
  try {
    const res = await fetchWithTimeout(`${base}/${path}.json`, { method: 'DELETE' });
    return res.ok ? { ok: true } : { ok: false, status: res.status };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Atomic read-modify-write using Firebase REST ETag / If-Match conditional writes.
//
// How it works:
//   1. GET the path — Firebase returns the current value + an ETag header.
//   2. Call updater(currentValue) → newValue.
//   3. PUT newValue with `if-match: <ETag>`. Firebase rejects with 412 if the
//      value changed between step 1 and 3 (concurrent write detected).
//   4. Retry from step 1 on 412, up to maxRetries times.
//
// Return null from updater to DELETE the node instead of writing.
// This is used for TOGGLE_VOTE to prevent double-vote races.
export async function firebaseTransaction(path, updater, maxRetries = 3) {
  const base = await getFirebaseUrl();
  if (!base) return { ok: false, error: 'Firebase URL not configured' };
  const url = `${base}/${path}.json`;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let etag, currentValue;
    try {
      const getRes = await fetchWithTimeout(url);
      etag = getRes.headers.get('ETag');
      currentValue = getRes.ok ? await getRes.json() : null;
    } catch (e) {
      return { ok: false, error: e.message };
    }

    const newValue = updater(currentValue);
    const method = newValue === null ? 'DELETE' : 'PUT';
    const headers = { 'Content-Type': 'application/json' };
    if (etag) headers['if-match'] = etag;

    try {
      const writeRes = await fetchWithTimeout(url, {
        method,
        headers,
        body: newValue === null ? undefined : JSON.stringify(newValue),
      });
      if (writeRes.status === 412) continue; // ETag mismatch — retry
      if (!writeRes.ok) {
        const text = await writeRes.text().catch(() => '');
        return { ok: false, status: writeRes.status, error: text };
      }
      return { ok: true, value: newValue };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
  return { ok: false, error: 'Transaction failed after max retries' };
}
