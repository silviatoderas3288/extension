// scraper.js
// Extracts listing data from Airbnb wishlist card DOM elements

window.AirbnbScraper = {
  /**
   * Find all listing cards in the wishlist grid.
   * Airbnb renders cards as anchor tags or divs with itemprop="itemListElement"
   * We try multiple selectors to be resilient against Airbnb DOM changes.
   */
  findListingCards() {
    // card-container wraps the photo scroller; its parentElement also contains the title/name below
    // We want the direct parent of card-container, which holds both the photo section and the text section
    const cardContainers = document.querySelectorAll('[data-testid="card-container"]');
    if (cardContainers.length > 0) {
      return Array.from(cardContainers).map((el) => el.parentElement || el);
    }
    const selectors = [
      '[itemprop="itemListElement"]',
      '[data-testid="listing-card-wrapper"]',
    ];
    for (const sel of selectors) {
      const cards = document.querySelectorAll(sel);
      if (cards.length > 0) return Array.from(cards);
    }
    // Fallback: find anchor tags linking to /rooms/
    return Array.from(document.querySelectorAll('a[href*="/rooms/"]')).map(
      (a) => a.closest('[class]') || a
    );
  },

  /**
   * Extract listing data from a single card element.
   * Returns a listing object or null if extraction fails.
   */
  extractFromCard(card) {
    try {
      // Listing URL and ID
      const link = card.querySelector('a[href*="/rooms/"]') || card.closest('a[href*="/rooms/"]');
      const href = link?.getAttribute('href') || '';
      const idMatch = href.match(/\/rooms\/(\d+)/);
      if (!idMatch) return null;

      const id = idMatch[1];
      const url = href.startsWith('http') ? href : `https://www.airbnb.com${href}`;

      // listing-card-title is the property name row (e.g. "Cozy cabin in the mountains")
      // listing-card-name is the subtitle/location row (e.g. "Cabin in Malibu")
      const titleEl = card.querySelector('[data-testid="listing-card-title"]');
      const nameEl  = card.querySelector('[data-testid="listing-card-name"]');

      const locationTitle = nameEl?.textContent?.trim() || '';

      // Title: prefer the title test-id, fall back to name, then first div/span with 20+ chars
      let title = titleEl?.textContent?.trim() || '';
      if (!title) {
        // Broader fallback: first text node of meaningful length that isn't a price/rating
        const spans = card.querySelectorAll('div, span');
        for (const el of spans) {
          if (el.children.length > 0) continue;
          const t = el.textContent.trim();
          if (t.length >= 10 && !/^\$|^\d+(\.\d)?$|review/i.test(t)) { title = t; break; }
        }
      }
      if (!title) title = locationTitle || 'Listing';

      // Beds
      const bedsText = this._findTextContaining(card, ['bed', 'bedroom', 'studio']);

      // Saved dates
      const datesText = this._findTextContaining(card, ['saved for', 'apr', 'jan', 'feb', 'mar', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']);

      // Price — try to read directly from the card DOM (visible when dates are selected)
      const nightlyPrice = this.extractNightlyPrice(card);
      const priceText = nightlyPrice ? `$${nightlyPrice}` : '';

      // Rating
      const ratingEl =
        card.querySelector('[class*="rating"]') ||
        card.querySelector('[aria-label*="rating"]') ||
        card.querySelector('span[class*="r4a59j5"]');
      const ratingText = ratingEl?.textContent?.trim() || '';
      const ratingMatch = ratingText.match(/[\d.]+/);
      const rating = ratingMatch ? parseFloat(ratingMatch[0]) : null;

      // Review count
      const reviewMatch = ratingText.match(/(\d+)\s*review/i);
      const reviewCount = reviewMatch ? parseInt(reviewMatch[1]) : null;

      // Cover photo
      const img =
        card.querySelector('img[src*="muscache"]') ||
        card.querySelector('img[class*="photo"]') ||
        card.querySelector('img');
      const photo = img?.src || img?.getAttribute('data-src') || '';

      // Guest count
      const guestText = this._findTextContaining(card, ['guest', 'guests max', 'guests']);

      // Badge (Superhost / Guest Favourite)
      const badgeEl = card.querySelector('[class*="superhost"], [aria-label*="Superhost"], [class*="guest-favorite"]');
      const badge = badgeEl?.textContent?.trim() || null;

      return {
        id,
        url,
        title,        // property name (e.g. "Stylish Oceanfront Suite with Pool")
        locationTitle, // location type (e.g. "Apartment in Nassau") — shown as subtitle
        beds: bedsText,
        savedDates: datesText,
        priceText,
        nightlyPrice,  // parsed from card DOM when dates are selected
        rating,
        reviewCount,
        photo,
        guestText,
        badge,
        amenities: null, // fetched lazily
      };
    } catch (e) {
      return null;
    }
  },

  /**
   * Extract the nightly price as a number directly from a card element.
   * Airbnb wishlist cards show the TOTAL price when dates are selected.
   * We divide by the number of nights to get the nightly rate.
   * Returns null if no reliable price is found.
   */
  extractNightlyPrice(card) {
    // Try to get nights from URL first, then from card text (e.g. "5 nights", "total for 3 nights")
    let nights = this.getSelectedNights();
    if (!nights) {
      const cardText = card.textContent || '';
      const m = cardText.match(/(\d+)\s*night/i);
      if (m) nights = parseInt(m[1]);
    }
    console.log('[Extension] extractNightlyPrice nights:', nights);
    // Airbnb shows total price on wishlist cards when dates are selected.
    // Divide by nights to get nightly rate. If no dates, treat as nightly already.
    const toNightly = (total) => (nights > 1 ? Math.round(total / nights) : total);

    // 1. Try specific test-id targets first
    const specific = [
      card.querySelector('[data-testid="listing-card-price"]'),
      card.querySelector('[data-testid="price-availability-row"]'),
    ].filter(Boolean);

    for (const el of specific) {
      const price = this._parseNightlyFromText(el.textContent);
      if (price !== null) return toNightly(price);
    }

    // 2. Walk leaf text nodes — find a node whose text is just "$NNN"
    const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const t = node.textContent.trim();
      if (/^\$[\d,]+$/.test(t)) {
        const n = parseFloat(t.replace(/[$,]/g, ''));
        if (n > 0 && n < 100000) return toNightly(n);
      }
    }

    // 3. Fallback: any element whose direct text contains "$NNN /night" pattern
    const all = card.querySelectorAll('span, div');
    for (const el of all) {
      if (el.children.length > 3) continue;
      const price = this._parseNightlyFromText(el.textContent);
      if (price !== null) return toNightly(price);
    }

    return null;
  },

  /**
   * Parse a nightly price from a text string.
   * Matches "$120", "$1,200 / night", "$120/night", etc.
   * Avoids total prices like "$600 for 5 nights".
   */
  _parseNightlyFromText(text) {
    if (!text) return null;
    const t = text.trim();
    // Reject if it looks like a total ("for N nights")
    if (/for\s+\d+\s+nights?/i.test(t)) return null;
    // Match "$NNN" optionally followed by " / night" or "/night"
    const m = t.match(/\$\s*([\d,]+)(?:\s*\/\s*night)?/i);
    if (!m) return null;
    const n = parseFloat(m[1].replace(/,/g, ''));
    return (n > 0 && n < 100000) ? n : null;
  },

  /**
   * Parse a price string into a number. Returns null on failure.
   * Handles "$120", "$1,200", "€99", etc.
   */
  parsePriceText(text) {
    return this._parseNightlyFromText(text);
  },

  /**
   * Helper: find text content in card elements that contains any of the given keywords.
   */
  _findTextContaining(card, keywords) {
    const spans = card.querySelectorAll('span, div, p');
    for (const el of spans) {
      const text = el.textContent?.trim().toLowerCase();
      if (text && keywords.some((kw) => text.includes(kw))) {
        return el.textContent.trim();
      }
    }
    return '';
  },

  /**
   * Get the guest count currently selected in the Airbnb filter pill.
   * Targets the guests filter button (e.g. "2 guests") in the wishlist header.
   */
  getSelectedGuestCount() {
    // Find any button whose text contains a number followed by "guest"
    const buttons = document.querySelectorAll('button[aria-expanded]');
    for (const btn of buttons) {
      const text = btn.textContent.trim();
      const m = text.match(/^(\d+)\s*guests?$/i);
      if (m) return parseInt(m[1]);
    }

    // Fallback: URL params
    const params = new URLSearchParams(window.location.search);
    const adults = parseInt(params.get('adults') || '0');
    const children = parseInt(params.get('children') || '0');
    if (adults + children > 0) return adults + children;

    return 1;
  },

  /**
   * Get the number of nights from the selected check_in / check_out dates.
   * Returns null if dates are not selected.
   */
  getSelectedNights() {
    const params = new URLSearchParams(window.location.search);
    const checkIn  = params.get('check_in');
    const checkOut = params.get('check_out');
    if (!checkIn || !checkOut) return null;
    const diff = (new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24);
    return diff > 0 ? diff : null;
  },

  /**
   * Scrape all listings from the current wishlist page.
   * Returns an array of listing objects with card element references.
   */
  scrapeAll() {
    const cards = this.findListingCards();
    return cards
      .map((card) => {
        const data = this.extractFromCard(card);
        if (data) data._cardEl = card;
        return data;
      })
      .filter(Boolean);
  },
};
