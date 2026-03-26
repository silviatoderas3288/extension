// filter-panel.js
// Deep Dive Filter — inline filter bar injected below the Quick Comparison panel,
// spanning the full width of the wishlist content area (same as comparison panel).

window.FilterPanel = {
  panel: null,
  _allListings: [],
  _onFilterChange: null,

  _filters: {
    minPrice: null,
    maxPrice: null,
    minBeds: null,
    minBaths: null,
    minRating: null,
    minGuests: null,
    amenities: [],
    cancellation: [],
  },
  _sortPrice: null, // null | 'asc' | 'desc'

  _amenityList: [
    { key: 'wifi',        label: 'Wifi' },
    { key: 'kitchen',     label: 'Kitchen' },
    { key: 'parking',     label: 'Parking' },
    { key: 'pool',        label: 'Pool' },
    { key: 'ac',          label: 'A/C' },
    { key: 'washer',      label: 'Washer' },
    { key: 'dryer',       label: 'Dryer' },
    { key: 'tv',          label: 'TV' },
    { key: 'hairDryer',   label: 'Hair Dryer' },
    { key: 'beachAccess', label: 'Beach Access' },
    { key: 'petsAllowed', label: 'Pets OK' },
    { key: 'instantBook', label: 'Instant Book' },
    { key: 'hotTub',      label: 'Hot Tub' },
    { key: 'bbq',         label: 'BBQ' },
    { key: 'gym',         label: 'Gym' },
    { key: 'fan',         label: 'Fan' },
    { key: 'elevator',    label: 'Elevator' },
    { key: 'smokeAlarm',  label: 'Smoke Alarm' },
  ],

  _findInsertionTarget() {
    return (
      document.querySelector('[data-testid="wishlist-tab-section"]') ||
      document.querySelector('#wishlist-tab-section') ||
      document.querySelector('main > section > div')
    );
  },

  inject(allListings, onFilterChange, onExpand) {
    this._allListings = allListings;
    this._onFilterChange = onFilterChange;
    this._onExpand = onExpand || null;
    this._buildPanel();
  },

  _buildPanel() {
    if (this.panel) this.panel.remove();

    const amenityChips = this._amenityList.map(a =>
      `<button type="button" class="airbnb-fb-chip" data-amenity="${a.key}">${a.label}</button>`
    ).join('');

    const panel = document.createElement('div');
    panel.id = 'airbnb-filter-bar';
    panel.className = 'airbnb-fb-panel';
    panel.innerHTML = `
      <div class="airbnb-fb-header" id="airbnb-fb-toggle" role="button" aria-expanded="false" tabindex="0">
        <span class="airbnb-fb-title">Deep Dive</span>
        <span class="airbnb-fb-count" id="airbnb-fb-count"></span>
        <button class="airbnb-fb-clear" id="airbnb-fb-clear" style="display:none">Clear all</button>
        <svg class="airbnb-fb-chevron" id="airbnb-fb-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 6L8 10L12 6" stroke="#FF395C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="airbnb-fb-row" id="airbnb-fb-body" style="display:none">
        <div class="airbnb-fb-group">
          <label class="airbnb-fb-label">Price / night</label>
          <div class="airbnb-fb-price-row">
            <input type="number" class="airbnb-fb-input airbnb-fb-input--sm" id="airbnb-fb-min-price" placeholder="Min $" min="0" />
            <span class="airbnb-fb-dash">–</span>
            <input type="number" class="airbnb-fb-input airbnb-fb-input--sm" id="airbnb-fb-max-price" placeholder="Max $" min="0" />
          </div>
        </div>

        <div class="airbnb-fb-group">
          <label class="airbnb-fb-label" for="airbnb-fb-sort-select">Sort by price</label>
          <select class="airbnb-fb-select" id="airbnb-fb-sort-select">
            <option value="">Default</option>
            <option value="asc">Low → High</option>
            <option value="desc">High → Low</option>
          </select>
        </div>

        <div class="airbnb-fb-group">
          <label class="airbnb-fb-label">Min beds</label>
          <div class="airbnb-fb-stepper">
            <button class="airbnb-fb-step-btn" data-target="beds" data-dir="-1">&#x2212;</button>
            <span class="airbnb-fb-step-val" id="airbnb-fb-val-beds">Any</span>
            <button class="airbnb-fb-step-btn" data-target="beds" data-dir="1">+</button>
          </div>
        </div>

        <div class="airbnb-fb-group">
          <label class="airbnb-fb-label">Min baths</label>
          <div class="airbnb-fb-stepper">
            <button class="airbnb-fb-step-btn" data-target="baths" data-dir="-1">&#x2212;</button>
            <span class="airbnb-fb-step-val" id="airbnb-fb-val-baths">Any</span>
            <button class="airbnb-fb-step-btn" data-target="baths" data-dir="1">+</button>
          </div>
        </div>

        <div class="airbnb-fb-group">
          <label class="airbnb-fb-label">Min guests</label>
          <div class="airbnb-fb-stepper">
            <button class="airbnb-fb-step-btn" data-target="guests" data-dir="-1">&#x2212;</button>
            <span class="airbnb-fb-step-val" id="airbnb-fb-val-guests">Any</span>
            <button class="airbnb-fb-step-btn" data-target="guests" data-dir="1">+</button>
          </div>
        </div>

        <div class="airbnb-fb-group airbnb-fb-group--rating">
          <label class="airbnb-fb-label">Min rating: <span id="airbnb-fb-rating-val">Any</span></label>
          <input type="range" class="airbnb-fb-slider" id="airbnb-fb-rating" min="0" max="5" step="0.1" value="0" />
        </div>

        <div class="airbnb-fb-group airbnb-fb-group--wide">
          <label class="airbnb-fb-label">Must have</label>
          <div class="airbnb-fb-chips" id="airbnb-fb-amenity-chips">
            ${amenityChips}
          </div>
        </div>

        <div class="airbnb-fb-group">
          <label class="airbnb-fb-label">Cancellation</label>
          <div class="airbnb-fb-chips" id="airbnb-fb-cancel-chips">
            <button type="button" class="airbnb-fb-chip" data-cancel="flexible">Flexible</button>
            <button type="button" class="airbnb-fb-chip" data-cancel="moderate">Moderate</button>
            <button type="button" class="airbnb-fb-chip" data-cancel="strict">Strict</button>
          </div>
        </div>
      </div>
    `;

    const target = this._findInsertionTarget();
    if (target) {
      // Insert after the comparison panel if it exists, else prepend
      const compPanel = target.querySelector('#airbnb-comparison-panel');
      if (compPanel) {
        compPanel.insertAdjacentElement('afterend', panel);
      } else {
        target.prepend(panel);
      }
    } else {
      document.body.prepend(panel);
    }

    this.panel = panel;
    this._attachListeners();
  },

  _attachListeners() {
    if (!this.panel) return;

    // Collapse toggle
    const toggleBtn = this.panel.querySelector('#airbnb-fb-toggle');
    const body = this.panel.querySelector('#airbnb-fb-body');
    const chevron = this.panel.querySelector('#airbnb-fb-chevron');
    const clearBtn = this.panel.querySelector('#airbnb-fb-clear');

    const doToggle = (e) => {
      if (e.target === clearBtn || clearBtn?.contains(e.target)) return;
      const expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
      toggleBtn.setAttribute('aria-expanded', String(!expanded));
      body.style.display = expanded ? 'none' : 'flex';
      chevron.style.transform = expanded ? '' : 'rotate(180deg)';
      // Fire onExpand when opening so the caller can pre-fetch amenities
      if (!expanded && this._onExpand) this._onExpand();
    };

    toggleBtn?.addEventListener('click', doToggle);
    toggleBtn?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doToggle(e); }
    });

    const minPrice = this.panel.querySelector('#airbnb-fb-min-price');
    const maxPrice = this.panel.querySelector('#airbnb-fb-max-price');
    minPrice?.addEventListener('input', () => {
      this._filters.minPrice = minPrice.value !== '' ? parseFloat(minPrice.value) : null;
      this._applyFilters();
    });
    maxPrice?.addEventListener('input', () => {
      this._filters.maxPrice = maxPrice.value !== '' ? parseFloat(maxPrice.value) : null;
      this._applyFilters();
    });

    this.panel.querySelectorAll('.airbnb-fb-step-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.target;
        const dir = parseInt(btn.dataset.dir);
        const filterKey = target === 'beds' ? 'minBeds' : target === 'baths' ? 'minBaths' : 'minGuests';
        const current = this._filters[filterKey] ?? 0;
        const next = Math.max(0, current + dir);
        this._filters[filterKey] = next === 0 ? null : next;
        const valEl = this.panel.querySelector(`#airbnb-fb-val-${target}`);
        if (valEl) valEl.textContent = this._filters[filterKey] ?? 'Any';
        this._applyFilters();
      });
    });

    const ratingSlider = this.panel.querySelector('#airbnb-fb-rating');
    const ratingVal = this.panel.querySelector('#airbnb-fb-rating-val');
    ratingSlider?.addEventListener('input', () => {
      const val = parseFloat(ratingSlider.value);
      this._filters.minRating = val === 0 ? null : val;
      if (ratingVal) ratingVal.textContent = val === 0 ? 'Any' : val.toFixed(1);
      this._applyFilters();
    });

    const sortSelect = this.panel.querySelector('#airbnb-fb-sort-select');
    sortSelect?.addEventListener('change', () => {
      this._sortPrice = sortSelect.value || null;
      this._applyFilters();
    });

    this.panel.querySelectorAll('[data-amenity]').forEach(chip => {
      chip.addEventListener('click', () => {
        const key = chip.dataset.amenity;
        if (this._filters.amenities.includes(key)) {
          this._filters.amenities = this._filters.amenities.filter(k => k !== key);
          chip.classList.remove('airbnb-fb-chip--active');
        } else {
          this._filters.amenities.push(key);
          chip.classList.add('airbnb-fb-chip--active');
        }
        this._applyFilters();
      });
    });

    this.panel.querySelectorAll('[data-cancel]').forEach(chip => {
      chip.addEventListener('click', () => {
        const val = chip.dataset.cancel;
        if (this._filters.cancellation.includes(val)) {
          this._filters.cancellation = this._filters.cancellation.filter(v => v !== val);
          chip.classList.remove('airbnb-fb-chip--active');
        } else {
          this._filters.cancellation.push(val);
          chip.classList.add('airbnb-fb-chip--active');
        }
        this._applyFilters();
      });
    });

    this.panel.querySelector('#airbnb-fb-clear')?.addEventListener('click', () => {
      this._clearFilters();
    });
  },

  // Find the correct DOM element to show/hide for a listing.
  // Re-resolves from the live DOM so stale _cardEl references don't matter.
  _getHideTarget(listing) {
    // Find the link to this listing's room page in the live DOM
    const link = document.querySelector(`a[href*="/rooms/${listing.id}"]`);
    if (!link) return null;

    // Walk up until we find an element whose parent is a grid/flex container
    // that also contains other listing cards — that's the grid cell to hide.
    let el = link.parentElement;
    while (el && el.parentElement) {
      const parent = el.parentElement;
      // If the parent has multiple children and at least one sibling has a rooms link, this is the grid cell
      if (parent.children.length > 1) {
        const hasSiblingCard = Array.from(parent.children).some(
          child => child !== el && child.querySelector('a[href*="/rooms/"]')
        );
        if (hasSiblingCard) return el;
      }
      el = parent;
    }

    // Fallback: hide the card element itself
    return listing._cardEl || null;
  },

  _applyFilters() {
    const f = this._filters;
    let visible = 0;
    const total = this._allListings.length;

    this._allListings.forEach(listing => {
      const a = listing.amenities || null;
      let pass = true;

      // Price — use amenities.nightlyPrice first, then listing.nightlyPrice from card DOM
      if (f.minPrice !== null || f.maxPrice !== null) {
        const price = (a?.nightlyPrice > 0 ? a.nightlyPrice : null) || (listing.nightlyPrice > 0 ? listing.nightlyPrice : null);
        if (price !== null) {
          if (f.minPrice !== null && price < f.minPrice) pass = false;
          if (f.maxPrice !== null && price > f.maxPrice) pass = false;
        }
        // price === null means no price available yet → leave visible, will re-filter on arrival
      }

      if (f.minRating !== null && (listing.rating == null || listing.rating < f.minRating)) pass = false;

      if (a) {
        if (f.minBeds !== null && (a.beds == null || a.beds < f.minBeds)) pass = false;
        if (f.minBaths !== null && (a.baths == null || a.baths < f.minBaths)) pass = false;
        if (f.minGuests !== null && (a.maxGuests == null || a.maxGuests < f.minGuests)) pass = false;

        if (f.amenities.length > 0) {
          for (const key of f.amenities) {
            if (a[key] !== true) { pass = false; break; }
          }
        }

        if (f.cancellation.length > 0 && !f.cancellation.includes(a.cancellation)) pass = false;
      }

      const hideTarget = this._getHideTarget(listing);
      if (hideTarget) {
        hideTarget.style.display = pass ? '' : 'none';
      }
      if (pass) visible++;
    });

    const countEl = this.panel?.querySelector('#airbnb-fb-count');
    if (countEl) {
      countEl.textContent = visible === total ? '' : `${visible} of ${total} shown`;
    }

    const clearBtn = this.panel?.querySelector('#airbnb-fb-clear');
    if (clearBtn) {
      clearBtn.style.display = (this._getActiveFilterCount() > 0 || this._sortPrice) ? '' : 'none';
    }

    if (this._sortPrice) this._applySortInDOM();

    if (this._onFilterChange) this._onFilterChange(f);
  },

  _applySortInDOM() {
    // Collect all visible listings that have a price (amenities or card DOM)
    const getPrice = l => (l.amenities?.nightlyPrice > 0 ? l.amenities.nightlyPrice : null) || (l.nightlyPrice > 0 ? l.nightlyPrice : null);
    const withPrice = this._allListings
      .filter(l => getPrice(l) !== null)
      .sort((a, b) => this._sortPrice === 'asc'
        ? getPrice(a) - getPrice(b)
        : getPrice(b) - getPrice(a)
      );

    if (withPrice.length < 2) return;

    // Find the grid container from the first listing
    const firstTarget = this._getHideTarget(withPrice[0]);
    if (!firstTarget) return;
    const grid = firstTarget.parentElement;
    if (!grid) return;

    // Move each card's grid cell to the end of the grid in sorted order
    // (visible ones in price order, hidden ones don't matter)
    withPrice.forEach(listing => {
      const el = this._getHideTarget(listing);
      if (el && el.parentElement === grid && el.style.display !== 'none') {
        grid.appendChild(el);
      }
    });
  },

  _getActiveFilterCount() {
    const f = this._filters;
    let count = 0;
    if (f.minPrice !== null) count++;
    if (f.maxPrice !== null) count++;
    if (f.minBeds !== null) count++;
    if (f.minBaths !== null) count++;
    if (f.minRating !== null) count++;
    if (f.minGuests !== null) count++;
    count += f.amenities.length;
    count += f.cancellation.length;
    return count;
  },

  _clearFilters() {
    this._filters = {
      minPrice: null, maxPrice: null,
      minBeds: null, minBaths: null,
      minRating: null, minGuests: null,
      amenities: [], cancellation: [],
    };

    if (this.panel) {
      const minP = this.panel.querySelector('#airbnb-fb-min-price');
      const maxP = this.panel.querySelector('#airbnb-fb-max-price');
      if (minP) minP.value = '';
      if (maxP) maxP.value = '';

      ['beds', 'baths', 'guests'].forEach(t => {
        const el = this.panel.querySelector(`#airbnb-fb-val-${t}`);
        if (el) el.textContent = 'Any';
      });

      const slider = this.panel.querySelector('#airbnb-fb-rating');
      if (slider) slider.value = 0;
      const ratingVal = this.panel.querySelector('#airbnb-fb-rating-val');
      if (ratingVal) ratingVal.textContent = 'Any';

      this.panel.querySelectorAll('[data-amenity], [data-cancel]').forEach(chip => {
        chip.classList.remove('airbnb-fb-chip--active');
      });
      this._sortPrice = null;
      const sortSel = this.panel.querySelector('#airbnb-fb-sort-select');
      if (sortSel) sortSel.value = '';
    }

    this._applyFilters();
  },

  update(allListings) {
    this._allListings = allListings;
    this._applyFilters();
  },

  // Called after comparison panel renders so Deep Dive stays below it
  reposition() {
    if (!this.panel) return;
    const target = this._findInsertionTarget();
    if (!target) return;
    const compPanel = target.querySelector('#airbnb-comparison-panel');
    if (compPanel && this.panel.previousElementSibling !== compPanel) {
      compPanel.insertAdjacentElement('afterend', this.panel);
    }
  },

  remove() {
    this._allListings.forEach(l => {
      const t = this._getHideTarget(l);
      if (t) t.style.display = '';
    });
    this.panel?.remove();
    this.panel = null;
    this._allListings = [];
    this._filters = {
      minPrice: null, maxPrice: null,
      minBeds: null, minBaths: null,
      minRating: null, minGuests: null,
      amenities: [], cancellation: [],
    };
  },
};
