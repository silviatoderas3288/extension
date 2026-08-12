// filter-panel.js
// Filter panel — injected in the wishlist content area.
// Controlled by a "Filters" pill button in the wishlist header row.

window.AirbnbCompare = window.AirbnbCompare || {};
window.AirbnbCompare.FilterPanel = {
  panel: null,
  _filtersBtn: null,
  _filtersVisible: false,
  _allListings: [],
  _onFilterChange: null,

  _filters: {
    minPrice: null,
    maxPrice: null,
    minBeds: null,
    minBaths: null,
    minRating: null,
    minGuests: null,
    amenities: [],   // array of lowercased amenity labels
    cancellation: [],
  },
  _sortPrice: null, // null | 'asc' | 'desc'

  // Dynamically built from real listing data as amenities arrive.
  // Map: lowercased-label → display-label, sorted alphabetically.
  _amenityMap: new Map(),

  _findInsertionTarget() {
    return (
      document.querySelector('[data-testid="wishlist-tab-section"]') ||
      document.querySelector('#wishlist-tab-section') ||
      document.querySelector('main > section > div')
    );
  },

  _findHeaderRow() {
    const shareBtn = document.querySelector('[data-el="share-wishlist"]');
    if (shareBtn) return shareBtn.parentElement;
    const chipsRow = document.querySelector('#filter-menu-chip-group > div:not([id])');
    if (chipsRow) return chipsRow;
    return null;
  },

  inject(allListings, onFilterChange, onExpand) {
    this._allListings = allListings;
    this._onFilterChange = onFilterChange;
    this._onExpand = onExpand || null;
    this._injectFiltersBtn();
    this._buildPanel();
  },

  // ── Header row "Filters" button ───────────────────────────────────────────

  _injectFiltersBtn() {
    if (this._filtersBtn) return;

    const row = this._findHeaderRow();
    if (!row) return;

    const btn = document.createElement('button');
    btn.id = 'airbnb-filters-btn';
    btn.textContent = 'Filters';
    btn.className = 'airbnb-compare-btn';
    btn.setAttribute('aria-pressed', 'false');

    btn.addEventListener('click', () => {
      this._filtersVisible ? this._hidePanel() : this._showPanel();
    });

    row.appendChild(btn);
    this._filtersBtn = btn;
  },

  _showPanel() {
    if (!this.panel) this._buildPanel();
    this.panel.style.display = '';
    this._filtersVisible = true;
    this._filtersBtn?.setAttribute('aria-pressed', 'true');
    this._filtersBtn?.classList.add('airbnb-compare-btn--active');
    if (this._onExpand) this._onExpand();
  },

  _hidePanel() {
    if (this.panel) this.panel.style.display = 'none';
    this._filtersVisible = false;
    this._filtersBtn?.setAttribute('aria-pressed', 'false');
    this._filtersBtn?.classList.remove('airbnb-compare-btn--active');
  },

  // ── Panel ─────────────────────────────────────────────────────────────────

  _buildPanel() {
    if (this.panel) this.panel.remove();
    this._collectAmenities(this._allListings); // seed from any already-loaded data

    const chevron = `<svg class="airbnb-fb-dd-chevron" width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1l4 4 4-4" stroke="#FF395C" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>`;

    const amenityOptions = this._buildAmenityOptions();

    const cancelOptions = [
      { key: 'flexible', label: 'Flexible' },
      { key: 'moderate', label: 'Moderate' },
      { key: 'strict',   label: 'Strict' },
    ].map(c =>
      `<label class="airbnb-fb-dd-item"><input type="checkbox" class="airbnb-fb-dd-cb" data-cancel="${c.key}" /><span>${c.label}</span></label>`
    ).join('');

    const panel = document.createElement('div');
    panel.id = 'airbnb-filter-bar';
    panel.className = 'airbnb-fb-panel';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div class="airbnb-fb-header">
        <span class="airbnb-fb-title">Filters</span>
        <span class="airbnb-fb-count" id="airbnb-fb-count"></span>
        <button class="airbnb-fb-close-btn" id="airbnb-fb-close" aria-label="Close filters">&#x2715;</button>
      </div>
      <div class="airbnb-fb-row" id="airbnb-fb-body">
        <div class="airbnb-fb-group">
          <label class="airbnb-fb-label">Price / night</label>
          <div class="airbnb-fb-price-row">
            <input type="number" class="airbnb-fb-input airbnb-fb-input--sm" id="airbnb-fb-min-price" placeholder="Min $" min="0" />
            <span class="airbnb-fb-dash">–</span>
            <input type="number" class="airbnb-fb-input airbnb-fb-input--sm" id="airbnb-fb-max-price" placeholder="Max $" min="0" />
          </div>
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

        <div class="airbnb-fb-group">
          <label class="airbnb-fb-label">Min rating</label>
          <div class="airbnb-fb-stepper airbnb-fb-stepper--rating">
            <input type="range" class="airbnb-fb-slider" id="airbnb-fb-rating" min="0" max="5" step="0.1" value="0" />
            <span class="airbnb-fb-step-val" id="airbnb-fb-rating-val">Any</span>
          </div>
        </div>

        <div class="airbnb-fb-group">
          <label class="airbnb-fb-label">Amenities</label>
          <div class="airbnb-fb-multiselect" id="airbnb-fb-amenities-dd">
            <button type="button" class="airbnb-fb-dd-trigger" id="airbnb-fb-amenities-trigger">Any ${chevron}</button>
            <div class="airbnb-fb-dd-menu" id="airbnb-fb-amenities-menu" style="display:none">${amenityOptions}</div>
          </div>
        </div>

        <div class="airbnb-fb-group">
          <label class="airbnb-fb-label">Cancellation</label>
          <div class="airbnb-fb-multiselect" id="airbnb-fb-cancel-dd">
            <button type="button" class="airbnb-fb-dd-trigger" id="airbnb-fb-cancel-trigger">Any ${chevron}</button>
            <div class="airbnb-fb-dd-menu" id="airbnb-fb-cancel-menu" style="display:none">${cancelOptions}</div>
          </div>
        </div>

        <div class="airbnb-fb-group">
          <label class="airbnb-fb-label" for="airbnb-fb-sort-select">Sort by price</label>
          <select class="airbnb-fb-select" id="airbnb-fb-sort-select">
            <option value="">Default</option>
            <option value="asc">Price: Low → High</option>
            <option value="desc">Price: High → Low</option>
            <option value="votes">Most 👍 votes</option>
          </select>
        </div>

        <div class="airbnb-fb-group airbnb-fb-group--clear">
          <button class="airbnb-fb-clear" id="airbnb-fb-clear" style="display:none">Clear all</button>
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

  // Build <label> HTML for every amenity currently in _amenityMap
  _buildAmenityOptions() {
    if (this._amenityMap.size === 0) {
      return `<div class="airbnb-fb-dd-loading">Loading amenities…</div>`;
    }
    const items = [...this._amenityMap.entries()]
      .map(([key, label]) => {
        const checked = this._filters.amenities.includes(key) ? ' checked' : '';
        return `<label class="airbnb-fb-dd-item"><input type="checkbox" class="airbnb-fb-dd-cb" data-amenity="${key}"${checked} /><span>${label}</span></label>`;
      })
      .join('');
    return `<input type="text" class="airbnb-fb-amenity-search" placeholder="Search amenities…" autocomplete="off" />${items}`;
  },

  // Canonical amenity groups: each entry is [aliases[], canonicalDisplayName].
  // Any alias (matched by exact lowercase or substring) maps to the same display name.
  _AMENITY_GROUPS: [
    [['ac', 'air conditioning', 'central air', 'central air conditioning', 'a/c', 'airconditioning'], 'Air conditioning'],
    [['wifi', 'wi-fi', 'wireless internet', 'wireless'], 'WiFi'],
    [['kitchen', 'kitchenette', 'full kitchen'], 'Kitchen'],
    [['coffee', 'coffee maker', 'nespresso', 'keurig', 'coffee machine', 'espresso machine'], 'Coffee maker'],
    [['parking', 'free parking', 'free street parking', 'paid parking', 'garage'], 'Parking'],
    [['pool', 'swimming pool', 'private pool', 'shared pool'], 'Pool'],
    [['hot tub', 'jacuzzi', 'whirlpool', 'hottub'], 'Hot tub'],
    [['washer', 'washing machine', 'washer/dryer', 'laundry'], 'Washer'],
    [['dryer', 'clothes dryer'], 'Dryer'],
    [['tv', 'hdtv', 'cable tv', 'smart tv', 'television'], 'TV'],
    [['bbq', 'barbecue', 'grill', 'outdoor grill', 'bbq grill'], 'BBQ grill'],
    [['gym', 'exercise equipment', 'fitness', 'fitness center', 'fitness room'], 'Gym'],
    [['elevator', 'lift'], 'Elevator'],
    [['hair dryer', 'hairdryer'], 'Hair dryer'],
    [['smoke alarm', 'smoke detector'], 'Smoke alarm'],
    [['beach access', 'beachfront', 'beach front', 'beachaccess'], 'Beach access'],
    [['hot water', 'hot water kettle'], 'Hot water'],
    [['iron', 'clothing iron'], 'Iron'],
    [['clothing storage', 'wardrobe', 'closet', 'dresser', 'walk-in closet'], 'Clothing storage'],
    [['workspace', 'dedicated workspace', 'desk', 'work space'], 'Dedicated workspace'],
    [['high chair', 'highchair'], 'High chair'],
    [['crib', 'baby crib', 'travel crib', 'pack n play'], 'Crib'],
    [['fire pit', 'firepit'], 'Fire pit'],
    [['outdoor dining', 'outdoor dining area', 'patio or balcony', 'balcony', 'patio'], 'Patio / balcony'],
    [['outdoor shower', 'outdoor shower area'], 'Outdoor shower'],
    [['first aid kit', 'first aid'], 'First aid kit'],
    [['fire extinguisher'], 'Fire extinguisher'],
    [['carbon monoxide alarm', 'carbon monoxide detector', 'co alarm', 'co detector'], 'Carbon monoxide alarm'],
    [['lockbox', 'lock box', 'smart lock', 'keypad', 'self check-in', 'self checkin'], 'Self check-in'],
    [['shower', 'shower gel', 'body soap', 'bath'], 'Shower'],
    [['shampoo', 'conditioner'], 'Shampoo'],
    [['bed linens', 'linens', 'sheets'], 'Bed linens'],
    [['towels', 'towel'], 'Towels'],
    [['hangers', 'hanger'], 'Hangers'],
    [['refrigerator', 'fridge'], 'Refrigerator'],
    [['microwave'], 'Microwave'],
    [['dishes', 'dishes and silverware', 'silverware', 'cutlery', 'cookware'], 'Dishes & silverware'],
  ],

  // Normalise a raw amenity label to a canonical {key, label}.
  // Returns the canonical entry if any alias matches; otherwise returns the original.
  _normalizeAmenity(raw) {
    const s = raw.toLowerCase().trim();
    for (const [aliases, canonical] of this._AMENITY_GROUPS) {
      if (aliases.some(a => s === a || s.startsWith(a + ' ') || s.endsWith(' ' + a) || s.includes(' ' + a + ' '))) {
        return { key: canonical.toLowerCase(), label: canonical };
      }
    }
    return { key: s, label: raw.trim() };
  },

  // Scan all listings for their allAmenities arrays; add any new ones to _amenityMap.
  // Returns true if new amenities were discovered.
  _collectAmenities(allListings) {
    const before = this._amenityMap.size;
    for (const l of allListings) {
      const list = l.amenities?.allAmenities;
      if (!Array.isArray(list)) continue;
      for (const raw of list) {
        if (!raw) continue;
        const { key, label } = this._normalizeAmenity(raw);
        if (key && !this._amenityMap.has(key)) {
          this._amenityMap.set(key, label);
        }
      }
    }
    // Keep sorted alphabetically by label
    this._amenityMap = new Map(
      [...this._amenityMap.entries()].sort((a, b) => a[1].localeCompare(b[1]))
    );
    return this._amenityMap.size > before;
  },

  // Swap out just the amenity menu HTML and re-attach checkbox listeners only.
  // Does NOT re-bind the trigger click — that was already done by _attachListeners
  // and must not be duplicated (extra handlers would cause the menu to toggle closed).
  _rebuildAmenitiesDropdown() {
    const menu = this.panel?.querySelector('#airbnb-fb-amenities-menu');
    if (!menu) return;
    menu.innerHTML = this._buildAmenityOptions();
    // Search box — filter visible items as user types
    const searchInput = menu.querySelector('.airbnb-fb-amenity-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const q = searchInput.value.toLowerCase();
        menu.querySelectorAll('.airbnb-fb-dd-item').forEach(item => {
          item.style.display = item.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
      });
      // Prevent the dropdown's own click-outside handler from closing the menu
      // when the user clicks into the search box.
      searchInput.addEventListener('click', e => e.stopPropagation());
    }
    // Re-attach change listeners on the new checkboxes only
    menu.querySelectorAll('[data-amenity]').forEach(cb => {
      cb.addEventListener('change', () => {
        const key = cb.dataset.amenity;
        if (cb.checked) { if (!this._filters.amenities.includes(key)) this._filters.amenities.push(key); }
        else { this._filters.amenities = this._filters.amenities.filter(k => k !== key); }
        this._setTriggerLabel('#airbnb-fb-amenities-trigger', this._filters.amenities);
        this._applyFilters();
      });
    });
  },

  _attachListeners() {
    if (!this.panel) return;

    // Close button hides the panel and deactivates the Filters button
    this.panel.querySelector('#airbnb-fb-close')?.addEventListener('click', () => {
      this._hidePanel();
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

    // Must have multiselect dropdown
    this._bindMultiselect(
      '#airbnb-fb-amenities-dd', '#airbnb-fb-amenities-trigger', '#airbnb-fb-amenities-menu',
      '[data-amenity]',
      (cb) => {
        const key = cb.dataset.amenity;
        if (cb.checked) { if (!this._filters.amenities.includes(key)) this._filters.amenities.push(key); }
        else { this._filters.amenities = this._filters.amenities.filter(k => k !== key); }
        this._setTriggerLabel('#airbnb-fb-amenities-trigger', this._filters.amenities);
        this._applyFilters();
      }
    );

    // Cancellation multiselect dropdown
    this._bindMultiselect(
      '#airbnb-fb-cancel-dd', '#airbnb-fb-cancel-trigger', '#airbnb-fb-cancel-menu',
      '[data-cancel]',
      (cb) => {
        const val = cb.dataset.cancel;
        if (cb.checked) { if (!this._filters.cancellation.includes(val)) this._filters.cancellation.push(val); }
        else { this._filters.cancellation = this._filters.cancellation.filter(v => v !== val); }
        this._setTriggerLabel('#airbnb-fb-cancel-trigger', this._filters.cancellation);
        this._applyFilters();
      }
    );

    // Close dropdowns on outside click
    document.addEventListener('click', (e) => {
      if (!this.panel) return;
      this.panel.querySelectorAll('.airbnb-fb-multiselect').forEach(dd => {
        if (!dd.contains(e.target)) {
          dd.querySelector('.airbnb-fb-dd-menu')?.style && (dd.querySelector('.airbnb-fb-dd-menu').style.display = 'none');
          dd.querySelector('.airbnb-fb-dd-trigger')?.classList.remove('airbnb-fb-dd-trigger--open');
        }
      });
    });

    this.panel.querySelector('#airbnb-fb-clear')?.addEventListener('click', () => {
      this._clearFilters();
    });
  },

  _bindMultiselect(ddSel, triggerSel, menuSel, cbSel, onChange) {
    const dd = this.panel.querySelector(ddSel);
    const trigger = this.panel.querySelector(triggerSel);
    const menu = this.panel.querySelector(menuSel);
    if (!trigger || !menu) return;

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = menu.style.display !== 'none';
      // Close all menus first
      this.panel.querySelectorAll('.airbnb-fb-dd-menu').forEach(m => (m.style.display = 'none'));
      this.panel.querySelectorAll('.airbnb-fb-dd-trigger').forEach(t => t.classList.remove('airbnb-fb-dd-trigger--open'));
      if (!isOpen) {
        menu.style.display = 'block';
        trigger.classList.add('airbnb-fb-dd-trigger--open');
      }
    });

    menu.addEventListener('click', (e) => e.stopPropagation());
    menu.querySelectorAll(cbSel).forEach(cb => cb.addEventListener('change', () => onChange(cb)));
  },

  _setTriggerLabel(triggerSel, selectedArr) {
    const trigger = this.panel?.querySelector(triggerSel);
    if (!trigger) return;
    const chevron = `<svg class="airbnb-fb-dd-chevron" width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1l4 4 4-4" stroke="#FF395C" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>`;
    trigger.innerHTML = `${selectedArr.length === 0 ? 'Any' : `${selectedArr.length} selected`} ${chevron}`;
    trigger.classList.toggle('airbnb-fb-dd-trigger--active', selectedArr.length > 0);
  },

  // Find the correct DOM element to show/hide for a listing.
  _getHideTarget(listing) {
    const link = document.querySelector(`a[href*="/rooms/${listing.id}"]`);
    if (!link) return null;

    let el = link.parentElement;
    while (el && el.parentElement) {
      const parent = el.parentElement;
      if (parent.children.length > 1) {
        const hasSiblingCard = Array.from(parent.children).some(
          child => child !== el && child.querySelector('a[href*="/rooms/"]')
        );
        if (hasSiblingCard) return el;
      }
      el = parent;
    }

    return listing._cardEl || null;
  },

  _applyFilters() {
    const f = this._filters;
    let visible = 0;
    const total = this._allListings.length;

    this._allListings.forEach(listing => {
      const a = listing.amenities || null;
      let pass = true;

      // Price filter: compare raw nightly price (no guest division)
      if (f.minPrice !== null || f.maxPrice !== null) {
        const nightlyPrice = (a?.nightlyPrice > 0 ? a.nightlyPrice : null) || (listing.nightlyPrice > 0 ? listing.nightlyPrice : null);
        if (nightlyPrice !== null) {
          if (f.minPrice !== null && nightlyPrice < f.minPrice) pass = false;
          if (f.maxPrice !== null && nightlyPrice > f.maxPrice) pass = false;
        }
        // nightlyPrice === null → no data yet, leave visible until it arrives
      }

      if (f.minRating !== null && (listing.rating == null || listing.rating < f.minRating)) pass = false;

      if (a) {
        if (f.minBeds !== null && (a.beds == null || a.beds < f.minBeds)) pass = false;
        if (f.minBaths !== null && (a.baths == null || a.baths < f.minBaths)) pass = false;
        if (f.minGuests !== null && (a.maxGuests == null || a.maxGuests < f.minGuests)) pass = false;

        if (f.amenities.length > 0) {
          // f.amenities contains canonical normalized keys (e.g. "air conditioning").
          // Normalize the listing's allAmenities the same way before comparing.
          const available = new Set(
            (a.allAmenities || []).map(s => this._normalizeAmenity(s).key)
          );
          for (const key of f.amenities) {
            if (!available.has(key)) { pass = false; break; }
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
    // Sort key: raw nightly price
    const getPrice = l => {
      const nightly = (l.amenities?.nightlyPrice > 0 ? l.amenities.nightlyPrice : null) || (l.nightlyPrice > 0 ? l.nightlyPrice : null);
      return nightly !== null ? nightly : null;
    };
    const getVotes = l => l.thumbsUp || 0;

    let sorted;
    if (this._sortPrice === 'votes') {
      sorted = [...this._allListings].sort((a, b) => getVotes(b) - getVotes(a));
    } else {
      sorted = this._allListings
        .filter(l => getPrice(l) !== null)
        .sort((a, b) => this._sortPrice === 'asc'
          ? getPrice(a) - getPrice(b)
          : getPrice(b) - getPrice(a)
        );
    }

    if (sorted.length < 2) return;

    const firstTarget = this._getHideTarget(sorted[0]);
    if (!firstTarget) return;
    const grid = firstTarget.parentElement;
    if (!grid) return;

    sorted.forEach(listing => {
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

      this.panel.querySelectorAll('.airbnb-fb-dd-cb').forEach(cb => { cb.checked = false; });
      this._setTriggerLabel('#airbnb-fb-amenities-trigger', []);
      this._setTriggerLabel('#airbnb-fb-cancel-trigger', []);
      this._sortPrice = null;
      const sortSel = this.panel.querySelector('#airbnb-fb-sort-select');
      if (sortSel) sortSel.value = '';
    }

    this._applyFilters();
  },

  update(allListings) {
    this._allListings = allListings;
    // Collect any newly discovered amenities and refresh the dropdown if needed
    const hadNew = this._collectAmenities(allListings);
    if (hadNew) this._rebuildAmenitiesDropdown();
    this._applyFilters();
  },

  sortByVotes() {
    this._sortPrice = 'votes';
    const sel = this.panel?.querySelector('#airbnb-fb-sort-select');
    if (sel) sel.value = 'votes';
    this._applySortInDOM();
  },

  // Called after comparison panel renders so Filters panel stays below it
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
    this._filtersBtn?.remove();
    this._filtersBtn = null;
    this._filtersVisible = false;
    this._allListings = [];
    this._filters = {
      minPrice: null, maxPrice: null,
      minBeds: null, minBaths: null,
      minRating: null, minGuests: null,
      amenities: [], cancellation: [],
    };
  },
};
