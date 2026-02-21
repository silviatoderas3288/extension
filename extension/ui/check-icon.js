// check-icon.js
// Injects circular check badge on each listing card (bottom-right of photo)
// Three states: unfilled (default), filled (selected), none (disabled)

window.CheckIcon = {
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

    // Find the photo container (first img or figure)
    const photoContainer =
      card.querySelector('picture, figure, [class*="Photo"], [class*="image"]') ||
      card.querySelector('img')?.parentElement;

    if (!photoContainer) return;

    // Make sure the photo container is positioned
    const computed = window.getComputedStyle(photoContainer);
    if (computed.position === 'static') {
      photoContainer.style.position = 'relative';
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

    photoContainer.appendChild(checkEl);
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
