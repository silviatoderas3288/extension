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

      // Property name — the actual listing name (e.g. "Stylish Oceanfront Suite with Pool")
      const nameEl = card.querySelector('[data-testid="listing-card-name"]');
      const name = nameEl?.textContent?.trim() || '';

      // Location type (e.g. "Apartment in Nassau") — used as fallback
      const titleEl = card.querySelector('[data-testid="listing-card-title"]');
      const locationTitle = titleEl?.textContent?.trim() || 'Listing';

      // Use property name as the primary display title; fall back to location type
      const title = name || locationTitle;

      // Beds
      const bedsText = this._findTextContaining(card, ['bed', 'bedroom', 'studio']);

      // Saved dates
      const datesText = this._findTextContaining(card, ['saved for', 'apr', 'jan', 'feb', 'mar', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']);

      // Price
      const priceEl =
        card.querySelector('[data-testid="price-availability-row"]') ||
        card.querySelector('span[class*="price"]') ||
        card.querySelector('[class*="_i5duul"]');
      const priceText = priceEl?.textContent?.trim() || '';

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
