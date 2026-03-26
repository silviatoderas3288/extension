// Background service worker
// Manages per-tab comparison state and handles amenity fetching

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

    // ── Amenities: search the full HTML text ──
    const htmlLower = html.toLowerCase();
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
