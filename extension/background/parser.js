// background/parser.js — listing page HTML parsing
// Extracts amenities, price, beds/baths/guests from Airbnb listing page HTML.
// Called via PARSE_AMENITIES (content script fetch with cookies) or the legacy
// FETCH_AMENITIES fallback (background fetch, no cookies).

// Verbose per-listing parse tracing — noisy on every scrape, so off by default.
// Flip to true (or set chrome.storage.local['debugParser']) when debugging extraction.
const DEBUG = false;
const log = DEBUG ? console.log.bind(console) : () => {};
const group = DEBUG ? console.group.bind(console) : () => {};
const groupEnd = DEBUG ? console.groupEnd.bind(console) : () => {};

// Fetch and parse from the background. NOTE: no cookies — Airbnb returns a
// stripped response. Prefer PARSE_AMENITIES where the content script fetches.
export async function fetchAmenities(listingUrl) {
  try {
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
    log('[Extension] Fetching (no cookies):', fullUrl);
    const res = await fetch(fullUrl);
    const html = await res.text();
    log('[Extension] HTML length (no cookies):', html.length);
    return parseAmenitiesFromHtml(html, fullUrl);
  } catch (e) {
    console.error('[Extension] fetchAmenities error:', e);
    return {};
  }
}

export function parseAmenitiesFromHtml(html, listingUrl) {
  try {
    const fullUrl = listingUrl || '';
    log('[Extension] parseAmenitiesFromHtml: HTML length:', html.length, 'for', fullUrl);

    let maxGuests = null;
    let baths = null;
    let beds = null;

    // ── Strategy 1: parse the __NEXT_DATA__ JSON blob embedded in the page ──
    // Airbnb SSR embeds all page data in <script id="__NEXT_DATA__" type="application/json">
    // Use indexOf instead of regex to avoid catastrophic backtracking on 3-5MB blobs.
    let nextDataMatch = null;
    {
      const scriptOpen = html.indexOf('id="__NEXT_DATA__"');
      if (scriptOpen !== -1) {
        const contentStart = html.indexOf('>', scriptOpen) + 1;
        const contentEnd = html.indexOf('</script>', contentStart);
        if (contentStart > 0 && contentEnd > contentStart) {
          nextDataMatch = [null, html.slice(contentStart, contentEnd)];
          log('[Extension] __NEXT_DATA__ found, length:', nextDataMatch[1].length);
        }
      }
      if (!nextDataMatch) log('[Extension] __NEXT_DATA__ NOT found in HTML');
    }
    if (nextDataMatch) {
      const raw = nextDataMatch[1];
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

    // ── Strategy 2: overview summary string ──
    if (baths === null || beds === null) {
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
      const m = html.match(/"bathroomLabel"\s*:\s*"(\d+(?:\.\d+)?)\s+baths?/i) ||
                html.match(/"bathroom_label"\s*:\s*"(\d+(?:\.\d+)?)/i) ||
                html.match(/"bathrooms"\s*:\s*(\d+(?:\.\d+)?)[,}]/) ||
                html.match(/(\d+(?:\.\d+)?)\s+baths?\s*&middot/i) ||
                html.match(/·\s*(\d+(?:\.\d+)?)\s+baths?/i);
      if (m) baths = parseFloat(m[1]);
    }

    if (baths === null) {
      const idx = html.toLowerCase().indexOf('bath');
      if (idx !== -1) {
        log('[Extension] First "bath" in HTML at', idx, ':', JSON.stringify(html.slice(Math.max(0, idx - 80), idx + 80)));
      } else {
        log('[Extension] "bath" not found anywhere in HTML');
      }
    }
    log('[Extension] maxGuests:', maxGuests, '| beds:', beds, '| baths:', baths);

    // ── Price ──
    let nightlyPrice = null;

    const priceJsonMatch = html.match(/"price"\s*:\s*\{\s*"amount"\s*:\s*(\d+)/);
    if (priceJsonMatch) nightlyPrice = parseInt(priceJsonMatch[1]);
    if (nightlyPrice > 10000) nightlyPrice = Math.round(nightlyPrice / 100);
    log('[Extension] Strategy 1 price:', nightlyPrice);

    if (!nightlyPrice && nextDataMatch) {
      log('[Extension] __NEXT_DATA__ found, length:', nextDataMatch[1].length);
      try {
        const raw = nextDataMatch[1];
        const dollarIdx = raw.search(/"\$\s*\d+"/);
        if (dollarIdx !== -1) {
          log('[Extension] First $ price in JSON:', JSON.stringify(raw.slice(Math.max(0, dollarIdx - 80), dollarIdx + 80)));
        }
        nightlyPrice = _extractStructuredPrice(raw);
        log('[Extension] Strategy 2 structured price:', nightlyPrice);
        if (!nightlyPrice) {
          nightlyPrice = _extractPriceFromJson(JSON.parse(raw));
          log('[Extension] Strategy 2 JSON walk price:', nightlyPrice);
        }
      } catch (e) {
        log('[Extension] JSON parse error:', e.message);
      }
    }

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

    // ── Amenities ──
    const htmlLower = html.toLowerCase();

    function walkForAmenities(obj, found, depth) {
      if (depth > 20 || !obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) {
        for (const item of obj) walkForAmenities(item, found, depth + 1);
        return;
      }
      if (typeof obj.title === 'string' && typeof obj.available === 'boolean') {
        if (obj.available && obj.title.length >= 2 && obj.title.length <= 80) {
          found.add(obj.title.trim());
        }
        return;
      }
      for (const val of Object.values(obj)) {
        if (val && typeof val === 'object') walkForAmenities(val, found, depth + 1);
      }
    }

    function extractAllAmenities(raw) {
      if (!raw) return [];
      const found = new Set();

      const knownKeys = ['seeAllAmenitiesGroups','amenityGroups','pdpAmenitiesGroups',
                         'previewAmenitiesGroups','consolidatedAmenitiesGroups'];
      let foundKey = null;
      for (const k of knownKeys) {
        if (raw.includes(`"${k}"`)) { foundKey = k; break; }
      }
      if (foundKey) {
        const ki = raw.indexOf(`"${foundKey}"`);
        log(`[Extension] Amenity key found: "${foundKey}" at pos ${ki}`);
        log('[Extension] Context (first 400 chars):', JSON.stringify(raw.slice(ki, ki + 400)));
      } else {
        log('[Extension] No known amenity key found. Scanning for "amenity" occurrences...');
        const rawLower = raw.toLowerCase();
        let searchPos = 0;
        let occurrences = 0;
        while (occurrences < 5) {
          const anyIdx = rawLower.indexOf('"amenity', searchPos);
          if (anyIdx === -1) break;
          log(`[Extension]   occurrence ${occurrences + 1} at pos ${anyIdx}:`,
            JSON.stringify(raw.slice(anyIdx, anyIdx + 150)));
          searchPos = anyIdx + 1;
          occurrences++;
        }
        if (occurrences === 0) {
          log('[Extension] The word "amenity" was not found in __NEXT_DATA__ at all.');
          const htmlAmenityIdx = html.toLowerCase().indexOf('amenity');
          log('[Extension] "amenity" in full HTML:', htmlAmenityIdx !== -1 ? `yes, at pos ${htmlAmenityIdx}` : 'no');
        }
      }

      function extractAmenityGroups(raw, key) {
        const keyPattern = `"${key}":`;
        let idx = raw.indexOf(keyPattern);
        if (idx === -1) {
          idx = raw.indexOf(`"${key}"`);
          if (idx === -1) return false;
        }
        const searchFrom = idx + keyPattern.length;
        const arrStart = raw.indexOf('[', searchFrom);
        const objStart = raw.indexOf('{', searchFrom);
        let actualStart = arrStart;
        if (objStart !== -1 && (arrStart === -1 || objStart < arrStart) && objStart < searchFrom + 60) {
          const innerArr = raw.indexOf('[', objStart);
          if (innerArr !== -1 && innerArr < objStart + 200) actualStart = innerArr;
        }
        if (actualStart === -1 || actualStart > searchFrom + 200) return false;

        let depth = 0, end = actualStart;
        const limit = Math.min(raw.length, actualStart + 500000);
        for (; end < limit; end++) {
          const c = raw[end];
          if (c === '[' || c === '{') depth++;
          else if (c === ']' || c === '}') { if (--depth === 0) break; }
        }
        try {
          const groups = JSON.parse(raw.slice(actualStart, end + 1));
          const groupArr = Array.isArray(groups) ? groups : [];
          if (groupArr.length > 0) {
            const firstGroup = groupArr[0];
            const amenityKey = ['amenities','amenityItems','items','rows'].find(k => Array.isArray(firstGroup[k]));
            log(`[Extension] extractAmenityGroups("${key}"): ${groupArr.length} groups, first group keys:`,
              Object.keys(firstGroup), '| amenity array key:', amenityKey || 'NOT FOUND');
            if (!amenityKey && groupArr.length > 0) {
              log('[Extension] First group sample:', JSON.stringify(firstGroup).slice(0, 300));
            }
          }
          let added = 0;
          for (const group of groupArr) {
            const items = group.amenities || group.amenityItems || group.items || group.rows || [];
            for (const amenity of items) {
              if (amenity.available !== false && typeof amenity.title === 'string') {
                const t = amenity.title.trim();
                if (t.length >= 2 && t.length <= 120) { found.add(t); added++; }
              }
            }
          }
          log(`[Extension] extractAmenityGroups("${key}"): ${added} amenities`);
          return added > 0;
        } catch (e) {
          log(`[Extension] extractAmenityGroups("${key}") parse error:`, e.message,
            '| slice preview:', JSON.stringify(raw.slice(actualStart, actualStart + 200)));
          return false;
        }
      }

      const gotGroups = extractAmenityGroups(raw, 'seeAllAmenitiesGroups')
                     || extractAmenityGroups(raw, 'amenityGroups')
                     || extractAmenityGroups(raw, 'pdpAmenitiesGroups')
                     || extractAmenityGroups(raw, 'previewAmenitiesGroups')
                     || extractAmenityGroups(raw, 'consolidatedAmenitiesGroups');

      if (!gotGroups) {
        log('[Extension] Key-based extraction failed, trying full JSON tree walk...');
        try {
          walkForAmenities(JSON.parse(raw), found, 0);
          log('[Extension] Tree walk found:', found.size, 'amenities');
        } catch (e) {
          log('[Extension] JSON.parse failed:', e.message);
        }
      }

      {
        const sizeBefore = found.size;
        const availRe = /"available"\s*:\s*true/g;
        let m;
        while ((m = availRe.exec(raw)) !== null) {
          const winStart = Math.max(0, m.index - 800);
          const winEnd   = Math.min(raw.length, m.index + 800);
          const win = raw.slice(winStart, winEnd);
          const titleM = win.match(/"title"\s*:\s*"([^"]{2,120})"/);
          if (titleM) {
            const t = titleM[1].trim();
            if (t.length >= 2 && t.length <= 120) found.add(t);
          }
        }
        if (found.size > sizeBefore)
          log(`[Extension] Regex strategy added ${found.size - sizeBefore} more amenities`);
      }

      log('[Extension] Total discovered amenities:', found.size, [...found].sort());
      return [...found].filter(s => s.length >= 2 && s.length <= 120);
    }

    function extractAmenitiesFromHtml(rawHtml) {
      const found = new Set();

      const rowTitleRe = /<div[^>]+id="(?!pdp_unavailable_)[^"]*-row-title"[^>]*>\s*([^<\n]{2,100}?)\s*<\/div>/g;
      let m;
      while ((m = rowTitleRe.exec(rawHtml)) !== null) {
        const name = m[1].trim();
        if (name.length >= 2 && !name.startsWith('Unavailable:')) found.add(name);
      }

      const testIdRe = /data-testid="amenity[^"]*"[^>]*>\s*<[^>]+>\s*([^<\n]{2,100}?)\s*</g;
      while ((m = testIdRe.exec(rawHtml)) !== null) {
        const name = m[1].trim();
        if (name.length >= 2) found.add(name);
      }

      const jsonLdRe = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
      while ((m = jsonLdRe.exec(rawHtml)) !== null) {
        try {
          const ld = JSON.parse(m[1]);
          const features = ld.amenityFeature || (ld['@graph'] || []).flatMap(n => n.amenityFeature || []);
          for (const f of features) {
            if (f.name && f.value !== false) found.add(String(f.name).trim());
          }
        } catch (_) {}
      }

      if (found.size > 0) log('[Extension] HTML extraction found:', found.size, 'amenities');
      return [...found];
    }

    const htmlAmenities = extractAmenitiesFromHtml(html);

    let jsonCorpus = nextDataMatch ? nextDataMatch[1] : null;

    if (!jsonCorpus) {
      const rscChunks = [];
      const rscRe = /self\.__next_f\.push\(\[1\s*,\s*"((?:[^"\\]|\\.)*)"\]\)/g;
      let m;
      while ((m = rscRe.exec(html)) !== null) {
        try {
          rscChunks.push(JSON.parse('"' + m[1] + '"'));
        } catch (_) {
          rscChunks.push(m[1]);
        }
      }
      if (rscChunks.length > 0) {
        jsonCorpus = rscChunks.join('');
        log('[Extension] RSC payload found:', rscChunks.length, 'chunks, total length:', jsonCorpus.length);
      } else {
        jsonCorpus = html;
        log('[Extension] No structured JSON found — searching full HTML');
      }
    }

    const discoveredAmenities = [...new Set([...extractAllAmenities(jsonCorpus), ...htmlAmenities])];

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

    result.allAmenities = discoveredAmenities.length > 0
      ? discoveredAmenities
      : Object.entries(amenityKeywords)
          .filter(([key]) => result[key])
          .map(([key]) => key);

    if (htmlLower.includes('flexible')) result.cancellation = 'flexible';
    else if (htmlLower.includes('moderate')) result.cancellation = 'moderate';
    else if (htmlLower.includes('strict')) result.cancellation = 'strict';
    else result.cancellation = 'unknown';

    let listingName = '';
    const titleTagM = html.match(/<title[^>]*>([^<]{2,200})<\/title>/i);
    if (titleTagM) listingName = titleTagM[1].replace(/\s*[–\-|·]\s*Airbnb\s*$/i, '').trim();
    if (!listingName) {
      const ogM = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]{2,200})"/i);
      if (ogM) listingName = ogM[1].trim();
    }
    if (!listingName && nextDataMatch) {
      const nameM = nextDataMatch[1].match(/"name"\s*:\s*"([^"]{2,200})"/);
      if (nameM) listingName = nameM[1].trim();
    }
    if (!listingName) listingName = fullUrl;

    group(`[Extension] 🏠 ${listingName}`);
    log(`  URL:        ${fullUrl}`);
    log(`  Guests: ${maxGuests}  Beds: ${beds}  Baths: ${baths}  Price: $${nightlyPrice}`);
    log(`  Amenities (${result.allAmenities.length}):`, result.allAmenities.sort());
    groupEnd();

    return result;
  } catch (e) {
    console.error('[Extension] parseAmenitiesFromHtml error:', e);
    return {};
  }
}

function _extractStructuredPrice(raw) {
  const patterns = [
    /structuredDisplayPrice[^}]{0,300}"price"\s*:\s*"\$\s*([\d,]+)"/,
    /pdpDisplayPrice[^}]{0,300}"\$\s*([\d,]+)"/,
    /"displayPrice"\s*:\s*"\$\s*([\d,]+)"/,
    /"priceString"\s*:\s*"\$\s*([\d,]+)"/,
    /"price"\s*:\s*"\$\s*([\d,]+)"/,
    /"perNight"\s*:\s*\{[^}]{0,60}"amount"\s*:\s*([\d.]+)/,
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

function _extractPriceFromJson(obj, depth = 0) {
  if (depth > 12 || !obj || typeof obj !== 'object') return null;

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

  if (typeof obj.amount === 'number' && obj.currency) {
    const n = obj.amount > 10000 ? Math.round(obj.amount / 100) : obj.amount;
    if (n > 0 && n < 100000) return n;
  }

  for (const val of Object.values(obj)) {
    if (val && typeof val === 'object') {
      const found = _extractPriceFromJson(val, depth + 1);
      if (found) return found;
    }
  }
  return null;
}
