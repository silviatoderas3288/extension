// priorities-panel.js
// Collaborative Priorities panel — amenity priorities → winner & top 3

window.PrioritiesPanel = {
  panel: null,
  _iconBtn: null,
  _visible: false,
  _wishlistKey: '',
  _myPriorities: [],
  _allListings: [],

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
    { key: 'keyAccess',   label: 'Self Check-in' },
  ],

  _findInsertionTarget() {
    return (
      document.querySelector('[data-testid="wishlist-tab-section"]') ||
      document.querySelector('main > section > div') ||
      document.querySelector('main') ||
      document.body
    );
  },

  _hasCollaborators() {
    return !!(
      document.querySelector('[data-testid="wishlist-collaborator"]') ||
      document.querySelector('[data-testid="invite-collaborators"]') ||
      document.querySelector('[aria-label*="collaborator" i]') ||
      document.querySelector('[aria-label*="invite" i]') ||
      document.querySelector('[data-testid="wishlist-guest-avatar"]') ||
      document.querySelector('[data-testid="wishlist-avatars"]')
    );
  },

  inject(wishlistKey, allListings) {
    this._wishlistKey = wishlistKey;
    this._allListings = allListings;

    this._injectIcon();

    this._loadPriorities(() => { this._buildPanel(); });
  },

  _injectIcon() {
    if (this._iconBtn) return;

    // Place the people button right after the Filters button in the header
    const anchor = document.getElementById('airbnb-filters-btn') || document.getElementById('airbnb-compare-btn');
    if (!anchor) return;

    const btn = document.createElement('button');
    btn.id = 'airbnb-priorities-icon';
    btn.className = 'airbnb-pp-icon-btn';
    btn.setAttribute('aria-label', 'Collaborative Priorities');
    btn.title = 'Collaborative Priorities';
    btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 640 512" fill="currentColor"><path d="M144 160A80 80 0 1 0 144 0a80 80 0 1 0 0 160zm368 0A80 80 0 1 0 512 0a80 80 0 1 0 0 160zM0 298.7C0 310.4 9.6 320 21.3 320H234.7c.2 0 .4 0 .7 0c-26.6-23.5-43.3-57.8-43.3-96c0-7.6 .7-15 1.9-22.3c-13.6-6.3-28.7-9.7-44.6-9.7H106.7C47.8 192 0 239.8 0 298.7zM405.3 320H618.7c11.8 0 21.3-9.6 21.3-21.3C640 239.8 592.2 192 533.3 192H490.7c-15.9 0-31 3.5-44.6 9.7c1.3 7.2 1.9 14.7 1.9 22.3c0 38.2-16.8 72.5-43.3 96c.2 0 .4 0 .7 0zM224 256a96 96 0 1 1 192 0 96 96 0 1 1 -192 0zm-48 128h-.3c-27.6 0-51 18-58.7 43.3c-3 9.9 3.1 20.7 14.6 20.7H128c0 17.7 14.3 32 32 32h224c17.7 0 32-14.3 32-32h-3.7c11.4 0 17.6-10.8 14.6-20.7C419.3 402 395.9 384 368.3 384H368 176z"/></svg>`;

    btn.addEventListener('click', () => {
      this._visible ? this.hide() : this.show();
    });

    anchor.after(btn);
    this._iconBtn = btn;
  },

  // ── Panel ───────────────────────────────────────────────────────────────────

  _buildPanel() {
    if (this.panel) this.panel.remove();

    const panel = document.createElement('div');
    panel.id = 'airbnb-priorities-panel';
    panel.className = 'airbnb-pp-panel';
    panel.style.display = 'none';
    panel.innerHTML = this._buildHTML();

    const target = this._findInsertionTarget();
    const comparePanel = document.getElementById('airbnb-comparison-panel');
    if (comparePanel) {
      comparePanel.after(panel);
    } else {
      target.prepend(panel);
    }

    this.panel = panel;
    this._attachListeners();
  },

  _buildHTML() {
    const chipsHTML = this._amenityList.map(a => {
      const active = this._myPriorities.includes(a.key) ? ' airbnb-pp-chip--active' : '';
      return `<button class="airbnb-pp-chip${active}" data-key="${a.key}">${a.label}</button>`;
    }).join('');

    return `
      <div class="airbnb-pp-header">
        <span class="airbnb-pp-title">Collaborative Priorities</span>
        <button class="airbnb-pp-close">&#x2715;</button>
      </div>

      <div class="airbnb-pp-body">
        <div class="airbnb-pp-left">
          <div class="airbnb-pp-section">
            <div class="airbnb-pp-section-label">My Priorities <span class="airbnb-pp-limit-hint">(pick up to 5)</span></div>
            <div class="airbnb-pp-amenity-grid">${chipsHTML}</div>
          </div>
        </div>

        <div class="airbnb-pp-right">
          <div class="airbnb-pp-section">
            <div id="airbnb-pp-top3">${this._buildRankingsHTML()}</div>
          </div>
        </div>
      </div>
    `;
  },

  _buildRankingsHTML() {
    const ranked = this._rankListings(this._allListings);
    const hasPriorities = this._myPriorities.length > 0;

    if (!hasPriorities) {
      return '<div class="airbnb-pp-empty">Pick priorities to see the winner.</div>';
    }
    if (ranked.length === 0) {
      return '<div class="airbnb-pp-empty">Amenity data loading — check back shortly.</div>';
    }

    const [first, ...rest] = ranked;
    const runnerUps = rest.slice(0, 2);

    const winnerHTML = this._buildWinnerHTML(first);
    const runnersHTML = runnerUps.map((r, i) => this._buildRunnerUpHTML(r, i + 2)).join('');

    return `
      <div class="airbnb-pp-section-label" style="margin-bottom:10px">Winner &amp; Top 3</div>
      ${winnerHTML}
      ${runnersHTML ? `<div class="airbnb-pp-runners">${runnersHTML}</div>` : ''}
    `;
  },

  _buildWinnerHTML(r) {
    const l = r.listing;
    const photo = l.photo || '';
    const title = l.title || l.locationTitle || 'Listing';
    const priorityChips = this._myPriorities.map(key => {
      const label = this._amenityList.find(a => a.key === key)?.label || key;
      const hit = r.matchedKeys.includes(key);
      return `<span class="airbnb-pp-match-chip ${hit ? 'airbnb-pp-match-chip--hit' : 'airbnb-pp-match-chip--miss'}">${label}</span>`;
    }).join('');

    return `
      <div class="airbnb-pp-winner">
        <div class="airbnb-pp-winner-crown">&#x1F3C6; Winner</div>
        <div class="airbnb-pp-winner-body">
          ${photo ? `<img class="airbnb-pp-winner-photo" src="${photo}" alt="${title}" />` : ''}
          <div class="airbnb-pp-winner-info">
            <div class="airbnb-pp-winner-name">${title}</div>
            <div class="airbnb-pp-winner-meta">
              ${r.totalPriorities > 0 ? `<span class="airbnb-pp-winner-score">${r.matchCount}/${r.totalPriorities} priorities matched</span>` : ''}
              ${r.votes > 0 ? `<span class="airbnb-pp-winner-votes">👍 ${r.votes}</span>` : ''}
            </div>
            ${priorityChips ? `<div class="airbnb-pp-rank-chips" style="margin-top:6px">${priorityChips}</div>` : ''}
          </div>
        </div>
      </div>
    `;
  },

  _buildRunnerUpHTML(r, place) {
    const l = r.listing;
    const photo = l.photo || '';
    const title = l.title || l.locationTitle || 'Listing';
    const label = place === 2 ? '2nd' : '3rd';
    const color = place === 2 ? '#ff8c00' : '#888';
    return `
      <div class="airbnb-pp-rank-item airbnb-pp-rank-item--${place}">
        <div class="airbnb-pp-rank-top">
          <span class="airbnb-pp-rank-badge" style="background:${color}">${label}</span>
          ${photo ? `<img class="airbnb-pp-runner-photo" src="${photo}" alt="${title}" />` : ''}
          <div class="airbnb-pp-rank-info">
            <div class="airbnb-pp-rank-name">${title}</div>
            <div class="airbnb-pp-rank-score">
              ${r.totalPriorities > 0 ? `${r.matchCount}/${r.totalPriorities} priorities` : ''}
              ${r.votes > 0 ? ` · 👍 ${r.votes}` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  },

  _attachListeners() {
    if (!this.panel) return;

    this.panel.querySelector('.airbnb-pp-close').addEventListener('click', () => this.hide());

    this.panel.querySelectorAll('.airbnb-pp-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const key = chip.dataset.key;
        const idx = this._myPriorities.indexOf(key);
        if (idx !== -1) {
          this._myPriorities.splice(idx, 1);
          chip.classList.remove('airbnb-pp-chip--active');
        } else {
          if (this._myPriorities.length >= 5) return;
          this._myPriorities.push(key);
          chip.classList.add('airbnb-pp-chip--active');
        }
        this._savePriorities();
        this._refreshRankings();
      });
    });
  },

  _refreshRankings() {
    const el = this.panel?.querySelector('#airbnb-pp-top3');
    if (el) el.innerHTML = this._buildRankingsHTML();
  },

  // ── Ranking logic ────────────────────────────────────────────────────────────
  // Score = priority match % × 10 + thumbsUp × 2

  _rankListings(allListings) {
    const priorities = this._myPriorities;

    const candidates = allListings.filter(l =>
      l.amenities && Object.keys(l.amenities).length > 0
    );

    if (candidates.length === 0) return [];

    return candidates
      .map(l => {
        const a = l.amenities || {};
        const matched = priorities.filter(key => {
          if (key === 'cancellation') return a.cancellation && a.cancellation !== 'unknown';
          return a[key] === true;
        });
        const priorityScore = priorities.length > 0
          ? (matched.length / priorities.length) * 10
          : 0;
        const votes = l.thumbsUp || 0;
        const score = priorityScore + votes * 2;

        return {
          listing: l,
          score,
          matchCount: matched.length,
          matchedKeys: matched,
          totalPriorities: priorities.length,
          votes,
        };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  },

  // ── Storage ──────────────────────────────────────────────────────────────────

  _loadPriorities(callback) {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) { callback(); return; }
    try {
      chrome.runtime.sendMessage(
        { type: 'GET_PRIORITIES', wishlistKey: this._wishlistKey },
        (response) => {
          if (chrome.runtime.lastError) { callback(); return; }
          if (response?.data) this._myPriorities = response.data.myPriorities || [];
          callback();
        }
      );
    } catch (e) { callback(); }
  },

  _savePriorities() {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
    try {
      chrome.runtime.sendMessage({
        type: 'SAVE_PRIORITIES',
        wishlistKey: this._wishlistKey,
        data: { myPriorities: this._myPriorities },
      });
    } catch (e) {}
  },

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  update(allListings) {
    this._allListings = allListings;
    if (this._visible) this._refreshRankings();
  },

  show() {
    if (!this.panel) this._buildPanel();
    this.panel.style.display = '';
    this._visible = true;
    this._iconBtn?.classList.add('airbnb-pp-icon-btn--active');
  },

  hide() {
    if (this.panel) this.panel.style.display = 'none';
    this._visible = false;
    this._iconBtn?.classList.remove('airbnb-pp-icon-btn--active');
  },

  remove() {
    this.panel?.remove();
    this._iconBtn?.remove();
    this.panel = null;
    this._iconBtn = null;
    this._visible = false;
    this._myPriorities = [];
    this._allListings = [];
  },
};
