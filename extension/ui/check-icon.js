// check-icon.js
// Injects circular check badge on each listing card (bottom-right of photo)
// Three states: unfilled (default), filled (selected), none (disabled)

window.AirbnbCompare = window.AirbnbCompare || {};
window.AirbnbCompare.CheckIcon = {
  /**
   * Inject check icons onto all currently scraped listing cards.
   * @param {Array} listings - array from AirbnbScraper.scrapeAll()
   * @param {Function} onToggle - callback(listing, isSelected)
   */
  injectAll(listings, onToggle) {
    listings.forEach((listing) => {
      this.injectOnCard(listing, onToggle);
    });
  },

  /**
   * Inject a single check icon on a card element.
   */
  injectOnCard(listing, onToggle) {
    const card = listing._cardEl;
    if (!card || card.querySelector('.airbnb-check-icon')) return;

    // Card photos are carousels: several <img> slides share the DOM, but only
    // one is actually laid out — the rest are display:none, zero-size, or
    // shifted off-screen via transform for the swipe animation. Cards can
    // also contain small, unrelated visible images (host avatar, Superhost /
    // Guest-favorite badge icons) that appear earlier in DOM order than the
    // cover photo — a plain "first visible image" heuristic would anchor the
    // check icon to one of those instead. Filter out anything below a size
    // floor (badges/avatars are reliably small, cover photos are not), then
    // pick the largest by rendered area so the actual cover photo wins.
    const candidates = Array.from(card.querySelectorAll('img')).filter((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return rect.width >= 80 && rect.height > 0 && candidate.offsetParent !== null;
    });
    const img = candidates.reduce((largest, candidate) => {
      if (!largest) return candidate;
      const largestRect = largest.getBoundingClientRect();
      const candidateRect = candidate.getBoundingClientRect();
      const largestArea = largestRect.width * largestRect.height;
      const candidateArea = candidateRect.width * candidateRect.height;
      return candidateArea > largestArea ? candidate : largest;
    }, null);
    if (!img) return;

    // Anchor directly inside the image's own immediate parent and let CSS
    // (bottom/right, see content.css) pin the icon to its corner. JS pixel
    // math recomputed only on specific events (resize, image resize,
    // one rAF after injection) used to drift out of sync during scroll —
    // lazy-loaded image swaps and layout shifts between events left the
    // icon visibly detached from the photo. Anchoring in CSS against the
    // image's own box means the browser keeps it pinned through scroll/
    // reflow with no recomputation, so no drift is possible.
    const anchor = img.parentElement;
    const computed = window.getComputedStyle(anchor);
    if (computed.position === 'static') {
      anchor.style.position = 'relative';
    }

    const checkEl = document.createElement('button');
    checkEl.className = 'airbnb-check-icon airbnb-check-icon--unfilled';
    checkEl.setAttribute('aria-label', `Select ${listing.title} for comparison`);
    checkEl.setAttribute('data-listing-id', listing.id);
    checkEl.innerHTML = this._svgUnfilled();
    checkEl.title = 'Add to comparison';

    checkEl.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const isFilled = checkEl.classList.contains('airbnb-check-icon--filled');
      onToggle(listing, !isFilled);
    });

    anchor.appendChild(checkEl);
    listing._checkEl = checkEl;
  },

  /**
   * Update the visual state of a check icon.
   * @param {string} listingId
   * @param {'unfilled'|'filled'|'none'} state
   */
  setState(listingId, state) {
    const el = document.querySelector(`.airbnb-check-icon[data-listing-id="${listingId}"]`);
    if (!el) return;

    el.classList.remove('airbnb-check-icon--unfilled', 'airbnb-check-icon--filled', 'airbnb-check-icon--none');
    el.classList.add(`airbnb-check-icon--${state}`);
    el.setAttribute('aria-pressed', state === 'filled' ? 'true' : 'false');
    el.disabled = state === 'none';

    if (state === 'filled') {
      el.innerHTML = this._svgFilled();
      el.title = 'Remove from comparison';
    } else if (state === 'none') {
      el.innerHTML = this._svgNone();
      el.title = 'Maximum 3 listings selected';
    } else {
      el.innerHTML = this._svgUnfilled();
      el.title = 'Add to comparison';
    }
  },

  /**
   * Reset all check icons to unfilled (or none if disabled).
   */
  resetAll(selectedIds = []) {
    document.querySelectorAll('.airbnb-check-icon').forEach((el) => {
      const id = el.getAttribute('data-listing-id');
      if (selectedIds.includes(id)) {
        this.setState(id, 'filled');
      } else if (selectedIds.length >= 3) {
        this.setState(id, 'none');
      } else {
        this.setState(id, 'unfilled');
      }
    });
  },

  // SVG icons — sized to match Airbnb's heart icon (~20px)
  _svgFilled() {
    return `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10" cy="10" r="10" fill="#FF395C"/>
      <path d="M5.5 10L8.5 13L14.5 7" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  },

  _svgUnfilled() {
    return `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10" cy="10" r="9" fill="transparent" stroke="white" stroke-width="2"/>
    </svg>`;
  },

  _svgNone() {
    return `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10" cy="10" r="9" fill="#F0F0F0" stroke="#E0E0E0" stroke-width="2"/>
    </svg>`;
  },
};
