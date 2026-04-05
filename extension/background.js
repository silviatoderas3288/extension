// Background service worker
// Manages per-tab comparison state and handles amenity fetching

// ── Firebase Realtime Database config ────────────────────────────────────────
// Create a free project at https://console.firebase.google.com
// Enable Realtime Database, set rules to allow read/write (or auth-based rules)
// Then paste your DB URL below (format: https://YOUR-PROJECT-default-rtdb.firebaseio.com)
const FIREBASE_DB_URL = 'https://wishlist-collab-default-rtdb.firebaseio.com';

// ── Stable per-browser user ID ───────────────────────────────────────────────
async function getOrCreateUserId() {
  return new Promise(resolve => {
    chrome.storage.local.get('collabUserId', result => {
      if (result.collabUserId) { resolve(result.collabUserId); return; }
      const id = 'u_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
      chrome.storage.local.set({ collabUserId: id }, () => resolve(id));
    });
  });
}

function wishlistDbKey(wishlistKey) {
  // Firebase keys cannot contain . # $ / [ ]
  return wishlistKey.replace(/[.#$[\]/]/g, '_');
}

async function firebaseGet(path) {
  try {
    const res = await fetch(`${FIREBASE_DB_URL}/${path}.json`);
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

async function firebasePut(path, data) {
  try {
    await fetch(`${FIREBASE_DB_URL}/${path}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch { /* network error — will retry next save */ }
}

const tabState = {};

function getTabKey(tabId) {
  return `tab_${tabId}`;
}

// Initialize state for a tab
function initTabState(tabId) {
  const key = getTabKey(tabId);
  if (!tabState[key]) {
    tabState[key] = {
      selectedListings: [], // max 3 listing objects
      compareActive: false,
    };
  }
  return tabState[key];
}

// Clean up state when tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabState[getTabKey(tabId)];
});

// Message handler from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  if (!tabId) return;

  const state = initTabState(tabId);

  switch (message.type) {
    case 'GET_STATE':
      sendResponse({ state });
      break;

    case 'SELECT_LISTING': {
      const listing = message.listing;
      const exists = state.selectedListings.find((l) => l.id === listing.id);
      if (!exists && state.selectedListings.length < 3) {
        state.selectedListings.push(listing);
      }
      sendResponse({ state });
      break;
    }

    case 'DESELECT_LISTING': {
      state.selectedListings = state.selectedListings.filter(
        (l) => l.id !== message.listingId
      );
      sendResponse({ state });
      break;
    }

    case 'SET_COMPARE_ACTIVE': {
      state.compareActive = message.active;
      sendResponse({ state });
      break;
    }

    case 'SWAP_LISTING': {
      // Swap listing in slot index with a new listing
      const { slotIndex, listing } = message;
      // Remove from current slot if already selected elsewhere
      state.selectedListings = state.selectedListings.filter(
        (l) => l.id !== listing.id
      );
      state.selectedListings[slotIndex] = listing;
      sendResponse({ state });
      break;
    }

    case 'FETCH_AMENITIES': {
      // Fetch the listing detail page and parse amenities
      fetchAmenities(message.listingUrl)
        .then((amenities) => sendResponse({ amenities }))
        .catch(() => sendResponse({ amenities: {} }));
      return true; // keep channel open for async response
    }

    // ── Legacy local-only priorities (kept for backward compat) ──────────────
    case 'GET_PRIORITIES': {
      const storageKey = 'priorities_' + (message.wishlistKey || '').replace(/\//g, '_');
      chrome.storage.sync.get(storageKey, (result) => {
        sendResponse({ data: result[storageKey] || null });
      });
      return true;
    }

    case 'SAVE_PRIORITIES': {
      const storageKey = 'priorities_' + (message.wishlistKey || '').replace(/\//g, '_');
      chrome.storage.sync.set({ [storageKey]: message.data }, () => {
        sendResponse({ ok: true });
      });
      return true;
    }

    // ── Collaborative priorities (Firebase-backed) ────────────────────────────

    case 'GET_USER_ID': {
      getOrCreateUserId().then(id => sendResponse({ userId: id }));
      return true;
    }

    case 'GET_COLLAB_PRIORITIES': {
      // Returns { participants: { userId: { name, priorities, updatedAt } } }
      const dbKey = wishlistDbKey(message.wishlistKey || 'default');
      firebaseGet(`wishlists/${dbKey}/participants`).then(participants => {
        sendResponse({ participants: participants || {} });
      });
      return true;
    }

    case 'SAVE_COLLAB_PRIORITIES': {
      // Saves this user's name + priorities to Firebase
      const dbKey = wishlistDbKey(message.wishlistKey || 'default');
      getOrCreateUserId().then(userId => {
        const path = `wishlists/${dbKey}/participants/${userId}`;
        const payload = {
          name: message.name || 'Anonymous',
          priorities: message.priorities || [],
          updatedAt: Date.now(),
        };
        firebasePut(path, payload).then(() => sendResponse({ ok: true, userId }));
      });
      return true;
    }

    default:
      sendResponse({ error: 'Unknown message type' });
  }

  return true;
});

// Fetch and parse amenities + listing details from a listing detail page
async function fetchAmenities(listingUrl) {
  try {
    // Keep check_in/check_out params — Airbnb only shows price when dates are present.
    // Strip other tracking params but preserve dates and guest counts.
    let fullUrl;
    try {
      const u = new URL(listingUrl.startsWith('http') ? listingUrl : `https://www.airbnb.com${listingUrl}`);
      const keep = ['check_in','check_out','adults','children','infants','pets'];
      const clean = new URL(u.origin + u.pathname);
      for (const k of keep) { if (u.searchParams.has(k)) clean.searchParams.set(k, u.searchParams.get(k)); }
      fullUrl = clean.toString();
    } catch (e) {
      fullUrl = listingUrl.replace(/\?.*$/, '');
    }
    console.log('[Extension] Fetching:', fullUrl);
    const res = await fetch(fullUrl);
    console.log('[Extension] HTTP status:', res.status, 'for', fullUrl);
    const html = await res.text();
    console.log('[Extension] HTML length:', html.length);

    let maxGuests = null;
    let baths = null;
    let beds = null;

    // ── Strategy 1: parse the __NEXT_DATA__ JSON blob embedded in the page ──
    // Airbnb SSR embeds all page data in <script id="__NEXT_DATA__" type="application/json">
    const nextDataMatch = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (nextDataMatch) {
      const raw = nextDataMatch[1];
      // Search the raw JSON string for bath/bed counts
      const bathM = raw.match(/"bathroomLabel"\s*:\s*"([^"]+)"/i) ||
                    raw.match(/"bathrooms_label"\s*:\s*"([^"]+)"/i);
      if (bathM) {
        const n = bathM[1].match(/(\d+(?:\.\d+)?)/);
        if (n) baths = parseFloat(n[1]);
      }
      const bedM = raw.match(/"bedCount"\s*:\s*(\d+)/) ||
                   raw.match(/"beds_label"\s*:\s*"(\d+)/i);
      if (bedM) beds = parseInt(bedM[1]);

      const guestM = raw.match(/"personCapacity"\s*:\s*(\d+)/);
      if (guestM) maxGuests = parseInt(guestM[1]);
    }

    // ── Strategy 2: search the full HTML for the overview summary string ──
    // Airbnb SSR often includes a string like "6 guests · 2 bedrooms · 3 beds · 3 baths"
    // in a JSON-encoded field somewhere in the page scripts.
    if (baths === null || beds === null) {
      // Look for the pattern encoded as a JSON string value: "6 guests · 2 bedrooms · 3 beds · 3 baths"
      const summaryM = html.match(/(\d+)\s+guests?[^"]{1,60}?(\d+)\s+beds?[^"]{1,40}?(\d+(?:\.\d+)?)\s+baths?/i);
      if (summaryM) {
        if (maxGuests === null) maxGuests = parseInt(summaryM[1]);
        if (beds === null) beds = parseInt(summaryM[2]);
        if (baths === null) baths = parseFloat(summaryM[3]);
      }
    }

    // ── Strategy 3: direct JSON key search across entire HTML ──
    if (maxGuests === null) {
      const m = html.match(/"personCapacity"\s*:\s*(\d+)/);
      if (m) maxGuests = parseInt(m[1]);
    }
    if (beds === null) {
      const m = html.match(/"bedCount"\s*:\s*(\d+)/);
      if (m) beds = parseInt(m[1]);
    }
    if (baths === null) {
      // Try various patterns Airbnb has used
      const m = html.match(/"bathroomLabel"\s*:\s*"(\d+(?:\.\d+)?)\s+baths?/i) ||
                html.match(/"bathroom_label"\s*:\s*"(\d+(?:\.\d+)?)/i) ||
                html.match(/"bathrooms"\s*:\s*(\d+(?:\.\d+)?)[,}]/) ||
                html.match(/(\d+(?:\.\d+)?)\s+baths?\s*&middot/i) ||
                html.match(/·\s*(\d+(?:\.\d+)?)\s+baths?/i);
      if (m) baths = parseFloat(m[1]);
    }

    // Log what we found and where baths is in the raw HTML
    if (baths === null) {
      const idx = html.toLowerCase().indexOf('bath');
      if (idx !== -1) {
        console.log('[Extension] First "bath" in HTML at', idx, ':', JSON.stringify(html.slice(Math.max(0, idx - 80), idx + 80)));
      } else {
        console.log('[Extension] "bath" not found anywhere in HTML');
      }
    }
    console.log('[Extension] maxGuests:', maxGuests, '| beds:', beds, '| baths:', baths);

    // ── Price: regex on raw HTML ──
    let nightlyPrice = null;

    // Strategy 1: original working pattern — "price":{"amount":NNN}
    const priceJsonMatch = html.match(/"price"\s*:\s*\{\s*"amount"\s*:\s*(\d+)/);
    if (priceJsonMatch) nightlyPrice = parseInt(priceJsonMatch[1]);
    if (nightlyPrice > 10000) nightlyPrice = Math.round(nightlyPrice / 100);
    console.log('[Extension] Strategy 1 price:', nightlyPrice);


    // Strategy 2: parse __NEXT_DATA__ JSON and search for structured price keys
    if (!nightlyPrice && nextDataMatch) {
      console.log('[Extension] __NEXT_DATA__ found, length:', nextDataMatch[1].length);
      try {
        const raw = nextDataMatch[1];
        const dollarIdx = raw.search(/"\$\s*\d+"/);
        if (dollarIdx !== -1) {
          console.log('[Extension] First $ price in JSON:', JSON.stringify(raw.slice(Math.max(0, dollarIdx - 80), dollarIdx + 80)));
        }
        nightlyPrice = _extractStructuredPrice(raw);
        console.log('[Extension] Strategy 2 structured price:', nightlyPrice);
        if (!nightlyPrice) {
          nightlyPrice = _extractPriceFromJson(JSON.parse(raw));
          console.log('[Extension] Strategy 2 JSON walk price:', nightlyPrice);
        }
      } catch (e) {
        console.log('[Extension] JSON parse error:', e.message);
      }
    }

    // Strategy 3: broader regex fallback on raw HTML
    if (!nightlyPrice) {
      const pricePatterns = [
        /"localizedPrice"\s*:\s*"\$\s*([\d,]+)"/,
        /"formattedPrice"\s*:\s*"\$\s*([\d,]+)"/,
        /"rate"\s*:\s*\{[^}]{0,60}"amount"\s*:\s*(\d+(?:\.\d+)?)/,
        /"basePrice"\s*:\s*\{[^}]{0,60}"amount"\s*:\s*(\d+(?:\.\d+)?)/,
      ];
      for (const pattern of pricePatterns) {
        const m = html.match(pattern);
        if (m) {
          const n = parseFloat(m[1].replace(/,/g, ''));
          if (n > 0) { nightlyPrice = n > 10000 ? Math.round(n / 100) : n; break; }
        }
      }
    }

    // ── Amenities: full parse from __NEXT_DATA__ + keyword fallback ──────────────
    const htmlLower = html.toLowerCase();

    // Walk a parsed JSON object tree looking for amenity objects.
    // Airbnb amenity objects look like: { "title": "Hair dryer", "available": true, "icon": {...} }
    // We detect them by the presence of both "title" (string) and "available" (boolean) fields.
    function walkForAmenities(obj, found, depth) {
      if (depth > 20 || !obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) {
        for (const item of obj) walkForAmenities(item, found, depth + 1);
        return;
      }
      // Amenity leaf: has both title and available fields
      if (typeof obj.title === 'string' && typeof obj.available === 'boolean') {
        if (obj.available && obj.title.length >= 2 && obj.title.length <= 80) {
          found.add(obj.title.trim());
        }
        return; // Don't recurse deeper — this is a leaf amenity object
      }
      for (const val of Object.values(obj)) {
        if (val && typeof val === 'object') walkForAmenities(val, found, depth + 1);
      }
    }

    // Extract every amenity name from the structured JSON Airbnb embeds in the page.
    // Returns an array of display-name strings for amenities that are marked available.
    function extractAllAmenities(raw) {
      if (!raw) return [];
      const found = new Set();

      // Strategy 1 — parse the full __NEXT_DATA__ JSON and walk the object tree.
      // This handles any field ordering (title before/after available) and nested structures.
      try {
        walkForAmenities(JSON.parse(raw), found, 0);
      } catch (e) {
        // JSON parse failed (very large or malformed) — fall through to regex fallbacks
      }

      // Strategy 2 — regex fallback: find "available":true and search nearby for "title".
      // Catches cases where the full JSON parse fails or is truncated.
      if (found.size === 0) {
        const availRe = /"available"\s*:\s*true/g;
        let m;
        while ((m = availRe.exec(raw)) !== null) {
          const winStart = Math.max(0, m.index - 500);
          const winEnd   = Math.min(raw.length, m.index + 500);
          const win = raw.slice(winStart, winEnd);
          const titleM = win.match(/"title"\s*:\s*"([^"]{2,80})"/);
          if (titleM) found.add(titleM[1].trim());
        }
      }

      // Strategy 3 — flat amenity name arrays: "amenities":["Wifi","Kitchen",...]
      const arrRe = /"amenities"\s*:\s*\[([^\]]{1,8000})\]/g;
      let m;
      while ((m = arrRe.exec(raw)) !== null) {
        const inner = m[1];
        const strRe = /"([A-Za-z][^"]{1,78})"/g;
        let sm;
        while ((sm = strRe.exec(inner)) !== null) {
          const s = sm[1].trim();
          if (s.length >= 2 && !/[/\\{}[\]]/.test(s)) found.add(s);
        }
      }

      return [...found].filter(s => s.length >= 2 && s.length <= 80);
    }

    // Pattern C — parse available amenities directly from rendered HTML row-title divs.
    // Available amenities use id="pdp_v3_CATEGORY_NUM_LISTINGID-row-title" or
    // id="security_camera_...-row-title" etc. Unavailable use id="pdp_unavailable_...-row-title".
    // We skip pdp_unavailable_ via negative lookahead; unavailable divs also contain <span>/<del>
    // which the [^<] content guard naturally rejects.
    function extractAmenitiesFromHtml(rawHtml) {
      const found = new Set();
      const rowTitleRe = /<div[^>]+id="(?!pdp_unavailable_)[^"]*-row-title"[^>]*>\s*([^<\n]{2,80}?)\s*<\/div>/g;
      let m;
      while ((m = rowTitleRe.exec(rawHtml)) !== null) {
        const name = m[1].trim();
        if (name && name.length >= 2 && !name.startsWith('Unavailable:')) {
          found.add(name);
        }
      }
      return [...found];
    }

    const htmlAmenities = extractAmenitiesFromHtml(html);
    const discoveredAmenities = nextDataMatch
      ? [...new Set([...extractAllAmenities(nextDataMatch[1]), ...htmlAmenities])]
      : htmlAmenities;

    // Keep the boolean shorthand flags for backward compat (comparison panel, priorities)
    const amenityKeywords = {
      wifi: ['wifi', 'wi-fi', 'wireless internet'],
      kitchen: ['kitchen', 'kitchenette'],
      parking: ['parking', 'free parking', 'garage'],
      hairDryer: ['hair dryer', 'hairdryer'],
      beachAccess: ['beach access', 'beachfront', 'beach front'],
      pool: ['pool', 'swimming pool'],
      ac: ['air conditioning', 'central air'],
      washer: ['washer', 'washing machine', 'laundry'],
      instantBook: ['instant book'],
      tv: ['hdtv', 'cable tv', '"tv"'],
      hotTub: ['hot tub', 'jacuzzi'],
      bbq: ['bbq', 'barbecue', 'grill'],
      gym: ['gym', 'exercise equipment', 'fitness'],
      elevator: ['elevator', 'lift'],
      smokeAlarm: ['smoke alarm', 'smoke detector'],
    };

    const result = { maxGuests, beds, baths, nightlyPrice };
    for (const [key, keywords] of Object.entries(amenityKeywords)) {
      result[key] = keywords.some((kw) => htmlLower.includes(kw));
    }

    // allAmenities — the full discovered list, deduplicated and sorted.
    // Used by the filter panel to build its dynamic dropdown.
    result.allAmenities = discoveredAmenities.length > 0
      ? discoveredAmenities
      : Object.entries(amenityKeywords)
          .filter(([key]) => result[key])
          .map(([key]) => key); // fallback: just the keys that matched

    // Cancellation policy
    if (htmlLower.includes('flexible')) result.cancellation = 'flexible';
    else if (htmlLower.includes('moderate')) result.cancellation = 'moderate';
    else if (htmlLower.includes('strict')) result.cancellation = 'strict';
    else result.cancellation = 'unknown';

    console.log('[Extension] Final nightlyPrice:', nightlyPrice, '| maxGuests:', maxGuests, '| beds:', beds, '| baths:', baths);
    console.log('[Extension] Parsed result:', JSON.stringify(result));
    return result;
  } catch (e) {
    console.error('[Extension] fetchAmenities error:', e);
    return {};
  }
}

// Search raw JSON string for Airbnb's structuredDisplayPrice / pdpDisplayPrice patterns.
// These are more specific than the generic walker and less likely to match fees/taxes.
function _extractStructuredPrice(raw) {
  // Pattern: "price":"$123" inside structuredDisplayPrice or similar price display keys
  const patterns = [
    // structuredDisplayPrice > primaryLine > price: "$123"
    /structuredDisplayPrice[^}]{0,300}"price"\s*:\s*"\$\s*([\d,]+)"/,
    // pdpDisplayPrice > perNight / nightly
    /pdpDisplayPrice[^}]{0,300}"\$\s*([\d,]+)"/,
    // "displayPrice":"$123"
    /"displayPrice"\s*:\s*"\$\s*([\d,]+)"/,
    // "priceString":"$123"
    /"priceString"\s*:\s*"\$\s*([\d,]+)"/,
    // "price":"$123" (generic, earlier patterns take priority)
    /"price"\s*:\s*"\$\s*([\d,]+)"/,
    // per-night price: {"amount":NNN,"currency":"USD"} after "perNight" key
    /"perNight"\s*:\s*\{[^}]{0,60}"amount"\s*:\s*([\d.]+)/,
    // "publicPrice":{"amount":NNN
    /"publicPrice"\s*:\s*\{[^}]{0,60}"amount"\s*:\s*([\d.]+)/,
  ];
  for (const pat of patterns) {
    const m = raw.match(pat);
    if (m) {
      const n = parseFloat(m[1].replace(/,/g, ''));
      if (n > 0 && n < 100000) {
        const price = n > 10000 ? Math.round(n / 100) : n;
        if (price > 0 && price < 100000) return price;
      }
    }
  }
  return null;
}

// Walk a parsed JSON object tree looking for a nightly price value.
// Airbnb buries price in deeply nested structures — we search broadly.
function _extractPriceFromJson(obj, depth = 0) {
  if (depth > 12 || !obj || typeof obj !== 'object') return null;

  // Direct price field patterns
  const priceKeys = ['price', 'localizedPrice', 'formattedPrice', 'originalPrice', 'discountedPrice'];
  for (const key of priceKeys) {
    if (typeof obj[key] === 'string') {
      const m = obj[key].match(/\$\s*([\d,]+)/);
      if (m) {
        const n = parseFloat(m[1].replace(/,/g, ''));
        if (n > 0 && n < 100000) return n;
      }
    }
  }

  // amount + currency pattern
  if (typeof obj.amount === 'number' && obj.currency) {
    const n = obj.amount > 10000 ? Math.round(obj.amount / 100) : obj.amount;
    if (n > 0 && n < 100000) return n;
  }

  // Recurse into children
  for (const val of Object.values(obj)) {
    if (val && typeof val === 'object') {
      const found = _extractPriceFromJson(val, depth + 1);
      if (found) return found;
    }
  }
  return null;
}
