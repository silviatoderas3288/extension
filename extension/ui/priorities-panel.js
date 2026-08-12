// priorities-panel.js
// Collaborative Priorities panel — chip-based, with member avatars and upvoting.

window.AirbnbCompare = window.AirbnbCompare || {};
window.AirbnbCompare.PrioritiesPanel = {
  panel: null,
  _iconBtn: null,
  _visible: false,
  _wishlistKey: '',
  _allListings: [],
  _userId: null,
  _myName: '',
  _myPriorities: [],
  _participants: {},
  _pollTimer: null,
  _colorCache: {},
  _qcOverrides: {}, // slotIndex -> listing id, set when the user swaps a Quick Compare slot manually

  _PALETTE: ['#E91E8C', '#2196F3', '#009688', '#7B61FF', '#FF5722', '#FF9800', '#4CAF50', '#607D8B'],

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

  // ── Color & avatar helpers ───────────────────────────────────────────────────

  _getColor(userId) {
    if (!this._colorCache[userId]) {
      const sorted = Object.keys(this._participants).sort();
      const idx = sorted.indexOf(userId);
      this._colorCache[userId] = this._PALETTE[(idx >= 0 ? idx : 0) % this._PALETTE.length];
    }
    return this._colorCache[userId];
  },

  _avatarHTML(userId, size) {
    size = size || 24;
    const color = this._getColor(userId);
    const initial = ((this._participants[userId]?.name || '?')[0] || '?').toUpperCase();
    const name = this._esc(this._participants[userId]?.name || '');
    const pName = (this._participants[userId]?.name || '').toLowerCase();
    const collab = this._scrapeCollaborators().find(c =>
      c.photo && pName.startsWith(c.name.split(' ')[0].toLowerCase())
    );
    if (collab) {
      return `<img class="airbnb-pp-av" style="width:${size}px;height:${size}px;" src="${collab.photo}" title="${name}" alt="${initial}" />`;
    }
    return `<span class="airbnb-pp-av" style="width:${size}px;height:${size}px;background:${color};font-size:${Math.round(size * 0.42)}px;" title="${name}">${initial}</span>`;
  },

  // ── Chip / label helpers ─────────────────────────────────────────────────────

  _labelForKey(key) {
    if (window.AirbnbCompare?.FilterPanel?._amenityMap?.has(key)) {
      return window.AirbnbCompare.FilterPanel._amenityMap.get(key);
    }
    return this._amenityList.find(a => a.key === key)?.label || key;
  },

  _isQuickKey(key) {
    return this._amenityList.some(a => a.key === key);
  },

  _buildChipsHTML() {
    return this._amenityList.map(a => {
      const active = this._myPriorities.includes(a.key) ? ' airbnb-pp-chip--active' : '';
      return `<button class="airbnb-pp-chip${active}" data-key="${a.key}">${a.label}</button>`;
    }).join('');
  },

  _buildExtrasHTML() {
    const extras = this._myPriorities.filter(key => !this._isQuickKey(key));
    if (extras.length === 0) return '';
    return extras.map(key =>
      `<span class="airbnb-pp-extra-tag" data-key="${key}">${this._labelForKey(key)}<button class="airbnb-pp-extra-remove" data-key="${key}" aria-label="Remove">&#x2715;</button></span>`
    ).join('');
  },

  // ── Scrape Airbnb collaborators ──────────────────────────────────────────────

  _scrapeCollaborators() {
    const results = [];
    document.querySelectorAll('[id^="collaborator-modal-"][id$="-row-title"]').forEach(el => {
      const name = el.textContent.trim();
      if (!name || name.toLowerCase() === 'you') return;
      const div = el.closest('[id^="collaborator-modal-"]');
      const img = div?.querySelector('img[src*="muscache"]');
      results.push({ name, photo: img?.src || '' });
    });
    return results;
  },

  // ── Extract Airbnb username ──────────────────────────────────────────────────

  _extractAirbnbUserName() {
    const nextDataEl = document.getElementById('__NEXT_DATA__');
    if (nextDataEl) {
      const raw = nextDataEl.textContent || '';
      const firstM = raw.match(/"firstName"\s*:\s*"([^"]+)"/);
      const lastM  = raw.match(/"lastName"\s*:\s*"([^"]+)"/);
      if (firstM) {
        const first = firstM[1].trim();
        const last  = lastM ? lastM[1].trim() : '';
        return last ? `${first} ${last}` : first;
      }
    }
    const profileBtn = document.querySelector('[data-testid="header-profile"]') ||
      document.querySelector('[aria-label*="Account navigation"]');
    if (profileBtn) {
      const m = (profileBtn.getAttribute('aria-label') || '').match(/[–—-]\s*(.+)$/);
      if (m) return m[1].trim();
    }
    for (const script of document.querySelectorAll('script:not([src])')) {
      const t = script.textContent || '';
      if (!t.includes('givenName') && !t.includes('firstName')) continue;
      const firstM = t.match(/"(?:givenName|firstName)"\s*:\s*"([^"]{1,40})"/);
      const lastM  = t.match(/"(?:familyName|lastName)"\s*:\s*"([^"]{1,40})"/);
      if (firstM) {
        const first = firstM[1].trim();
        const last  = lastM ? lastM[1].trim() : '';
        return last ? `${first} ${last}` : first;
      }
    }
    return '';
  },

  // ── Insertion target ─────────────────────────────────────────────────────────

  _findInsertionTarget() {
    return (
      document.querySelector('[data-testid="wishlist-tab-section"]') ||
      document.querySelector('main > section > div') ||
      document.querySelector('main') ||
      document.body
    );
  },

  // The header/button row this panel used to anchor near isn't reliably a
  // normal-flow ancestor of the actual listing grid (which may sit in its own,
  // possibly virtualized, container). Anchoring against the real card elements
  // instead guarantees the panel pushes the grid down rather than overlapping it.
  _findGridContainer() {
    const listings = this._allListings;
    if (!listings || listings.length === 0) return null;
    const sample = listings.slice(0, 3).map(l => l._cardEl).filter(Boolean);
    if (sample.length === 0) return null;

    const level1 = sample.map(el => el.parentElement).filter(Boolean);
    if (level1.length === sample.length && level1.every(p => p === level1[0])) {
      return level1[0];
    }

    const level2 = sample.map(el => el.parentElement?.parentElement).filter(Boolean);
    if (level2.length === sample.length && level2.every(p => p === level2[0])) {
      return level2[0];
    }

    return null;
  },

  // ── Firebase sync ────────────────────────────────────────────────────────────

  _fetchCollabPriorities(callback) {
    this._sendMsg({ type: 'GET_COLLAB_PRIORITIES', wishlistKey: this._wishlistKey }, (res) => {
      this._participants = res?.participants || {};
      this._colorCache = {};
      if (this._userId && this._participants[this._userId]) {
        const remote = this._participants[this._userId];
        if (this._myPriorities.length === 0 && remote.priorities?.length > 0)
          this._myPriorities = remote.priorities;
        if (!this._myName && remote.name)
          this._myName = remote.name;
      }
      if (callback) callback();
    });
  },

  _saveCollabPriorities() {
    if (!this._userId) return;
    chrome.storage.local.set({ ['collabUserName_' + this._userId]: this._myName });
    this._sendMsg({
      type: 'SAVE_COLLAB_PRIORITIES',
      wishlistKey: this._wishlistKey,
      name: this._myName || 'Anonymous',
      priorities: this._myPriorities,
    }, (res) => {
      if (res?.ok) this._cleanupStaleEntries();
      const hint = this.panel?.querySelector('#airbnb-pp-sync-hint');
      if (hint) {
        if (!res || !res.ok) {
          let msg;
          if (res?.status === 401 || res?.status === 403) msg = 'Firebase permission denied — set DB rules to allow read/write';
          else if (res?.status === 404) msg = 'Firebase DB not found (404) — check FIREBASE_DB_URL in background.js';
          else if (res?.status) msg = `Firebase error ${res.status} — check DB URL and rules`;
          else msg = 'Firebase unreachable — check network or FIREBASE_DB_URL in background.js';
          hint.style.color = '#c0392b';
          hint.textContent = msg;
        } else {
          hint.style.color = '';
          hint.textContent = 'Saved! Others will see your priorities within 15s.';
        }
      }
      this._sendMsg({ type: 'SAVE_PRIORITIES', wishlistKey: this._wishlistKey, data: { myPriorities: this._myPriorities } });
    });
    if (this._userId) {
      this._participants[this._userId] = { name: this._myName || 'Anonymous', priorities: this._myPriorities, updatedAt: Date.now() };
    }
  },

  _cleanupStaleEntries() {
    if (!this._myName || !this._userId) return;
    const myName = this._myName.toLowerCase().trim();
    Object.entries(this._participants).forEach(([id, p]) => {
      if (id === this._userId) return;
      if ((p.name || '').toLowerCase().trim() === myName) {
        this._sendMsg({ type: 'DELETE_COLLAB_PARTICIPANT', wishlistKey: this._wishlistKey, participantId: id });
        delete this._participants[id];
      }
    });
  },

  // ── Polling ──────────────────────────────────────────────────────────────────

  _startPolling() {
    this._stopPolling();
    this._pollTimer = setInterval(() => {
      if (!this._visible) return;
      this._fetchCollabPriorities(() => this._refreshAll());
    }, 15000);
  },

  _stopPolling() {
    if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
  },

  // ── Icon button ──────────────────────────────────────────────────────────────

  _injectIcon() {
    if (this._iconBtn) return;
    const anchor = document.getElementById('airbnb-filters-btn') || document.getElementById('airbnb-compare-btn');
    if (!anchor) return;
    const btn = document.createElement('button');
    btn.id = 'airbnb-priorities-icon';
    btn.className = 'airbnb-pp-icon-btn';
    btn.setAttribute('aria-label', 'Collaborative Priorities');
    btn.title = 'Collaborative Priorities';
    btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 640 512" fill="currentColor"><path d="M144 160A80 80 0 1 0 144 0a80 80 0 1 0 0 160zm368 0A80 80 0 1 0 512 0a80 80 0 1 0 0 160zM0 298.7C0 310.4 9.6 320 21.3 320H234.7c.2 0 .4 0 .7 0c-26.6-23.5-43.3-57.8-43.3-96c0-7.6 .7-15 1.9-22.3c-13.6-6.3-28.7-9.7-44.6-9.7H106.7C47.8 192 0 239.8 0 298.7zM405.3 320H618.7c11.8 0 21.3-9.6 21.3-21.3C640 239.8 592.2 192 533.3 192H490.7c-15.9 0-31 3.5-44.6 9.7c1.3 7.2 1.9 14.7 1.9 22.3c0 38.2-16.8 72.5-43.3 96c.2 0 .4 0 .7 0zM224 256a96 96 0 1 1 192 0 96 96 0 1 1 -192 0zm-48 128h-.3c-27.6 0-51 18-58.7 43.3c-3 9.9 3.1 20.7 14.6 20.7H128c0 17.7 14.3 32 32 32h224c17.7 0 32-14.3 32-32h-3.7c11.4 0 17.6-10.8 14.6-20.7C419.3 402 395.9 384 368.3 384H368 176z"/></svg>`;
    btn.addEventListener('click', () => { this._visible ? this.hide() : this.show(); });
    anchor.after(btn);
    this._iconBtn = btn;
    this._refreshIconBadge();
  },

  _refreshIconBadge() {
    if (!this._iconBtn) return;
    const count = Object.keys(this._participants).length;
    let badge = this._iconBtn.querySelector('.airbnb-pp-badge');
    if (count > 1) {
      if (!badge) { badge = document.createElement('span'); badge.className = 'airbnb-pp-badge'; this._iconBtn.appendChild(badge); }
      badge.textContent = count;
    } else if (badge) badge.remove();
  },

  // ── Build HTML ───────────────────────────────────────────────────────────────

  _buildHTML() {
    // Ensure current user is always present in participants map for rendering
    if (this._userId) {
      this._participants[this._userId] = {
        ...(this._participants[this._userId] || {}),
        name: this._myName || 'Me',
        priorities: this._myPriorities,
      };
    }

    const chipsHTML           = this._buildChipsHTML();
    const groupPrioritiesHTML = this._buildGroupPrioritiesHTML();
    const rankingsHTML        = this._buildRankingsHTML();
    const participantCount    = Object.keys(this._participants).length;
    const avatarsHTML         = Object.keys(this._participants).slice(0, 6).map(id => this._avatarHTML(id, 24)).join('');

    return `
      <div class="airbnb-pp-header">
        <span class="airbnb-pp-title">Trip Priorities</span>
        <div class="airbnb-pp-av-row" id="airbnb-pp-av-row">${avatarsHTML}</div>
        ${participantCount > 0 ? `<span class="airbnb-pp-participant-count">${participantCount} member${participantCount !== 1 ? 's' : ''}</span>` : ''}
        <button class="airbnb-pp-close">&#x2715;</button>
      </div>

      <div class="airbnb-pp-name-row">
        <label class="airbnb-pp-name-label">Your name</label>
        <input class="airbnb-pp-name-input" id="airbnb-pp-name" type="text"
          placeholder="Enter your name…" maxlength="30" value="${this._esc(this._myName)}" />
      </div>

      <div class="airbnb-pp-body">
        <div class="airbnb-pp-left">
          <div class="airbnb-pp-section">
            <div class="airbnb-pp-section-label">My Priorities <span class="airbnb-pp-limit-hint">(pick up to 5)</span></div>
            <div class="airbnb-pp-extras" id="airbnb-pp-extras">${this._buildExtrasHTML()}</div>
            <div class="airbnb-pp-search-wrap">
              <input class="airbnb-pp-chip-search" id="airbnb-pp-chip-search" type="text" placeholder="Search more amenities…" autocomplete="off" />
              <div class="airbnb-pp-dropdown" id="airbnb-pp-dropdown" style="display:none"></div>
            </div>
            <div class="airbnb-pp-amenity-grid" id="airbnb-pp-chip-grid">${chipsHTML}</div>
          </div>

          <div class="airbnb-pp-section" id="airbnb-pp-participants-section">
            <div class="airbnb-pp-section-label">Group Priorities <span class="airbnb-pp-tap-hint">Tap ↑ to vote</span></div>
            <div id="airbnb-pp-participants" class="airbnb-pp-group-list">${groupPrioritiesHTML}</div>
            <div class="airbnb-pp-group-add-row">
              <div class="airbnb-pp-group-search-wrap">
                <input class="airbnb-pp-group-search" id="airbnb-pp-group-search" type="text"
                  placeholder="Add a priority for the group…" autocomplete="off" />
                <div class="airbnb-pp-dropdown" id="airbnb-pp-group-dropdown" style="display:none"></div>
              </div>
              <button class="airbnb-pp-group-add-btn" id="airbnb-pp-group-add-btn">Add</button>
            </div>
          </div>
        </div>

        <div class="airbnb-pp-right">
          <div class="airbnb-pp-section">
            <div id="airbnb-pp-top3">${rankingsHTML}</div>
          </div>
        </div>
      </div>

      <div class="airbnb-pp-section airbnb-pp-quickcompare">
        <div class="airbnb-pp-section-label">Quick Compare</div>
        <div class="airbnb-pp-qc-cards" id="airbnb-pp-qc-cards">${this._buildQuickCompareCardsHTML()}</div>
      </div>

      <div class="airbnb-pp-footer">
        <span class="airbnb-pp-sync-hint" id="airbnb-pp-sync-hint">
          Share the wishlist link so others can join with the extension installed.
        </span>
      </div>
    `;
  },

  _buildGroupPrioritiesHTML() {
    // Build vote map: priority key → { voters: [userId, ...], count }
    const voteMap = new Map();
    for (const [id, p] of Object.entries(this._participants)) {
      for (const key of (p.priorities || [])) {
        if (!voteMap.has(key)) voteMap.set(key, { voters: [], count: 0 });
        const e = voteMap.get(key);
        e.voters.push(id);
        e.count++;
      }
    }

    if (voteMap.size === 0) {
      return '<div class="airbnb-pp-group-empty">No priorities yet — add one below.</div>';
    }

    const sorted = [...voteMap.entries()]
      .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]));

    return sorted.map(([key, { voters, count }], i) => {
      const label       = this._labelForKey(key);
      const rank        = String(i + 1).padStart(2, '0');
      const avatarsHTML = voters.slice(0, 4).map(id => this._avatarHTML(id, 22)).join('');
      const alreadyMine = this._myPriorities.includes(key);
      const atLimit     = this._myPriorities.length >= 5;
      const btnActive   = alreadyMine ? ' airbnb-pp-group-vote-btn--active' : '';
      const btnTitle    = alreadyMine ? 'Remove from my priorities' : atLimit ? 'Remove one first (max 5)' : 'Add to my priorities';
      return `
        <div class="airbnb-pp-group-item">
          <span class="airbnb-pp-group-rank">${rank}</span>
          <span class="airbnb-pp-group-text">${this._esc(label)}</span>
          <div class="airbnb-pp-voter-avs">${avatarsHTML}</div>
          <button class="airbnb-pp-group-vote-btn${btnActive}" data-key="${key}" title="${btnTitle}">
            <span>↑</span><span>${count}</span>
          </button>
        </div>`;
    }).join('');
  },

  // Participants list with the current user's live (not-yet-saved) picks merged in,
  // shared by the rankings section and the Quick Compare defaults below.
  _effectiveParticipants() {
    const effectiveParticipants = [...Object.entries(this._participants)];
    if (this._userId) {
      const idx = effectiveParticipants.findIndex(([id]) => id === this._userId);
      const myEntry = [this._userId, { name: this._myName || 'Me', priorities: this._myPriorities }];
      if (idx === -1) effectiveParticipants.push(myEntry);
      else effectiveParticipants[idx] = myEntry;
    }
    return effectiveParticipants;
  },

  _buildRankingsHTML() {
    const effectiveParticipants = this._effectiveParticipants();
    const hasAny = effectiveParticipants.some(([, p]) => p.priorities?.length > 0);
    if (!hasAny) return '<div class="airbnb-pp-empty">Pick priorities to see group recommendations.</div>';
    const ranked = this._rankListingsForGroup(effectiveParticipants);
    if (ranked.length === 0) return '<div class="airbnb-pp-empty">Amenity data loading — check back shortly.</div>';

    const [first, ...rest] = ranked;
    const runnerUps = rest.slice(0, 2);
    const pCount = effectiveParticipants.filter(([, p]) => p.priorities?.length > 0).length;
    const label = pCount > 1 ? 'Best for the group' : 'Winner & Top 3';

    return `
      <div class="airbnb-pp-section-label" style="margin-bottom:10px">${label}</div>
      ${this._buildWinnerHTML(first, effectiveParticipants)}
      ${runnerUps.length ? `<div class="airbnb-pp-runners">${runnerUps.map((r, i) => this._buildRunnerUpHTML(r, i + 2, effectiveParticipants)).join('')}</div>` : ''}`;
  },

  _buildWinnerHTML(r, participants) {
    const l = r.listing;
    const photo = l.photo || '';
    const title = l.title || l.locationTitle || 'Listing';
    const breakdown = participants
      .filter(([, p]) => p.priorities?.length > 0)
      .map(([id, p]) => {
        const userMatches = r.perUserMatches[id] || { matched: 0, total: p.priorities.length };
        return `<span class="airbnb-pp-match-chip ${userMatches.matched > 0 ? 'airbnb-pp-match-chip--hit' : 'airbnb-pp-match-chip--miss'}">${this._esc(p.name || 'Anonymous')}: ${userMatches.matched}/${userMatches.total}</span>`;
      }).join('');
    return `
      <div class="airbnb-pp-winner">
        <div class="airbnb-pp-winner-crown">Winner</div>
        <div class="airbnb-pp-winner-body">
          <img class="airbnb-pp-winner-photo" src="${photo}" alt="${this._esc(title)}"
            onerror="this.style.display='none'" style="${photo ? '' : 'display:none'}" />
          <div class="airbnb-pp-winner-info">
            <div class="airbnb-pp-winner-name">${this._esc(title)}</div>
            <div class="airbnb-pp-winner-meta">${r.votes > 0 ? `<span class="airbnb-pp-winner-votes">👍 ${r.votes}</span>` : ''}</div>
            ${breakdown ? `<div class="airbnb-pp-rank-chips" style="margin-top:6px">${breakdown}</div>` : ''}
          </div>
        </div>
      </div>`;
  },

  _buildRunnerUpHTML(r, place, participants) {
    const l = r.listing;
    const photo = l.photo || '';
    const title = l.title || l.locationTitle || 'Listing';
    const label = place === 2 ? '2nd' : '3rd';
    return `
      <div class="airbnb-pp-rank-item airbnb-pp-rank-item--${place}">
        <div class="airbnb-pp-rank-top">
          <span class="airbnb-pp-rank-badge airbnb-pp-rank-badge--grey">${label}</span>
          <img class="airbnb-pp-runner-photo" src="${photo}" alt="${this._esc(title)}"
            onerror="this.style.display='none'" style="${photo ? '' : 'display:none'}" />
          <div class="airbnb-pp-rank-info">
            <div class="airbnb-pp-rank-name">${this._esc(title)}</div>
            <div class="airbnb-pp-rank-score">${r.votes > 0 ? `👍 ${r.votes}` : ''}</div>
          </div>
        </div>
      </div>`;
  },

  _rankListingsForGroup(participants) {
    const active = participants.filter(([, p]) => p.priorities?.length > 0);
    if (active.length === 0) return [];
    // Unavailable listings must never be auto-ranked into Winner/Runner-up/Quick Compare slots.
    const candidates = this._allListings.filter(l => !l.unavailable && l.amenities && Object.keys(l.amenities).length > 0);
    if (candidates.length === 0) return [];
    return candidates.map(l => {
      const a = l.amenities || {};
      let totalScore = 0;
      const perUserMatches = {};
      for (const [id, p] of active) {
        const priorities = p.priorities || [];
        const matched = priorities.filter(key => {
          if (key === 'cancellation') return a.cancellation && a.cancellation !== 'unknown';
          if (a[key] === true) return true;
          if (Array.isArray(a.allAmenities) && window.AirbnbCompare?.FilterPanel) {
            const fp = window.AirbnbCompare.FilterPanel;
            const nk = fp._normalizeAmenity(key).key;
            return a.allAmenities.some(raw => fp._normalizeAmenity(raw).key === nk);
          }
          return false;
        });
        perUserMatches[id] = { matched: matched.length, total: priorities.length };
        totalScore += priorities.length > 0 ? matched.length / priorities.length : 0;
      }
      const groupScore = totalScore / active.length;
      const votes = l.thumbsUp || 0;
      return { listing: l, groupScore, finalScore: groupScore * 10 + votes * 2, votes, perUserMatches };
    })
    .filter(r => r.finalScore > 0)
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, 3);
  },

  // ── Quick Compare (embedded card view, capped at 3 slots) ───────────────────
  // Defaults to the same top-3 ranked listings as the Winner + Runner-up section,
  // but each slot can be swapped independently via its own dropdown. Reuses
  // ComparisonPanel's card/icon-grid markup rather than duplicating it —
  // comparison-panel.js loads before this file in manifest.json.

  _buildQuickCompareCardsHTML() {
    const CP = window.AirbnbCompare?.ComparisonPanel;
    if (!CP) return '';

    const ranked = this._rankListingsForGroup(this._effectiveParticipants());
    const defaults = ranked.map(r => r.listing);

    // Keep ComparisonPanel's own state in sync since _buildCard/_buildIconGrid
    // read from `this` (CP) internally — both panels share the same full listing set.
    CP._allListings = this._allListings;
    CP._guestCount = window.AirbnbCompare?.AirbnbScraper?.getSelectedGuestCount() ?? 1;

    const slots = [0, 1, 2].map((i) => {
      const overrideId = this._qcOverrides[i];
      const override = overrideId ? this._allListings.find(l => l.id === overrideId) : null;
      return override || defaults[i] || null;
    });

    return slots.map((listing, i) => {
      if (!listing) {
        return `<div class="airbnb-pp-qc-slot airbnb-pp-qc-slot--empty" data-slot="${i}">Not enough data yet</div>`;
      }
      const cardHTML = CP._buildCard(listing, i, 3);
      const iconGridHTML = CP._buildIconGrid(listing.amenities || {});
      return `
        <div class="airbnb-pp-qc-slot" data-slot="${i}">
          ${cardHTML}
          <div class="airbnb-cp-icon-card">
            <div class="airbnb-cp-icon-grid">${iconGridHTML}</div>
          </div>
        </div>`;
    }).join('');
  },

  _attachQuickCompareListeners() {
    this.panel?.querySelectorAll('.airbnb-pp-quickcompare .airbnb-cp-dropdown').forEach((select) => {
      select.addEventListener('change', (e) => {
        const slotIndex = parseInt(e.target.getAttribute('data-slot'), 10);
        this._qcOverrides[slotIndex] = e.target.value;
        this._refreshQuickCompare();
      });
    });
  },

  _refreshQuickCompare() {
    const el = this.panel?.querySelector('#airbnb-pp-qc-cards');
    if (!el) return;
    el.innerHTML = this._buildQuickCompareCardsHTML();
    this._attachQuickCompareListeners();
  },

  // ── Listeners ────────────────────────────────────────────────────────────────

  _attachListeners() {
    if (!this.panel) return;

    this.panel.querySelector('.airbnb-pp-close').addEventListener('click', () => this.hide());

    let nameTimer = null;
    const nameInput = this.panel.querySelector('#airbnb-pp-name');
    nameInput?.addEventListener('input', () => {
      this._myName = nameInput.value.trim();
      clearTimeout(nameTimer);
      nameTimer = setTimeout(() => this._saveCollabPriorities(), 800);
    });

    // Search → dropdown
    const chipSearch = this.panel.querySelector('#airbnb-pp-chip-search');
    const dropdown   = this.panel.querySelector('#airbnb-pp-dropdown');
    const closeDropdown = () => { if (dropdown) dropdown.style.display = 'none'; if (chipSearch) chipSearch.value = ''; };
    chipSearch?.addEventListener('input', () => {
      const q = chipSearch.value.trim().toLowerCase();
      const _fp1 = window.AirbnbCompare?.FilterPanel;
      if (!q || !_fp1?._amenityMap?.size) { dropdown.style.display = 'none'; return; }
      const results = [..._fp1._amenityMap.entries()]
        .filter(([key, label]) => label.toLowerCase().includes(q) && !this._myPriorities.includes(key))
        .slice(0, 10);
      if (!results.length) { dropdown.style.display = 'none'; return; }
      dropdown.innerHTML = results.map(([key, label]) => `<div class="airbnb-pp-dd-item" data-key="${key}">${label}</div>`).join('');
      dropdown.style.display = 'block';
      dropdown.querySelectorAll('.airbnb-pp-dd-item').forEach(item => {
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          const key = item.dataset.key;
          if (this._myPriorities.length < 5 && !this._myPriorities.includes(key)) {
            this._myPriorities.push(key);
            this._saveCollabPriorities();
            this._refreshChips();
            this._refreshAll();
          }
          closeDropdown();
        });
      });
    });
    chipSearch?.addEventListener('blur', () => closeDropdown());
    chipSearch?.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDropdown(); });

    // Group priorities search → dropdown → add to my priorities
    this._pendingGroupKey = null;
    const groupSearch   = this.panel.querySelector('#airbnb-pp-group-search');
    const groupDropdown = this.panel.querySelector('#airbnb-pp-group-dropdown');
    const closeGroupDropdown = () => { if (groupDropdown) groupDropdown.style.display = 'none'; };

    const doAddGroupPriority = () => {
      let key = this._pendingGroupKey;
      if (!key && groupSearch?.value.trim()) {
        const q = groupSearch.value.trim().toLowerCase();
        const _fp2 = window.AirbnbCompare?.FilterPanel;
        if (_fp2?._amenityMap?.size) {
          for (const [k, label] of _fp2._amenityMap.entries()) {
            if (label.toLowerCase() === q) { key = k; break; }
          }
        }
        if (!key) {
          const found = this._amenityList.find(a => a.label.toLowerCase() === q);
          if (found) key = found.key;
        }
      }
      if (key && !this._myPriorities.includes(key) && this._myPriorities.length < 5) {
        this._myPriorities.push(key);
        this._saveCollabPriorities();
        this._refreshChips();
        this._refreshAll();
      }
      if (groupSearch) groupSearch.value = '';
      this._pendingGroupKey = null;
      closeGroupDropdown();
    };

    groupSearch?.addEventListener('input', () => {
      const q = groupSearch.value.trim().toLowerCase();
      this._pendingGroupKey = null;
      const _fp3 = window.AirbnbCompare?.FilterPanel;
      if (!q || !_fp3?._amenityMap?.size) { closeGroupDropdown(); return; }
      const results = [..._fp3._amenityMap.entries()]
        .filter(([, label]) => label.toLowerCase().includes(q))
        .slice(0, 10);
      if (!results.length) { closeGroupDropdown(); return; }
      groupDropdown.innerHTML = results.map(([k, label]) =>
        `<div class="airbnb-pp-dd-item" data-key="${k}">${label}</div>`
      ).join('');
      groupDropdown.style.display = 'block';
      groupDropdown.querySelectorAll('.airbnb-pp-dd-item').forEach(item => {
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          this._pendingGroupKey = item.dataset.key;
          if (groupSearch) groupSearch.value = item.textContent;
          closeGroupDropdown();
        });
      });
    });
    groupSearch?.addEventListener('blur', () => setTimeout(closeGroupDropdown, 150));
    groupSearch?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeGroupDropdown();
      if (e.key === 'Enter') doAddGroupPriority();
    });
    this.panel.querySelector('#airbnb-pp-group-add-btn')?.addEventListener('click', doAddGroupPriority);

    this._attachExtraListeners();
    this._attachChipListeners();
    this._attachGroupVoteListeners();
    this._attachQuickCompareListeners();
  },

  _attachChipListeners() {
    this.panel?.querySelectorAll('.airbnb-pp-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const key = chip.dataset.key;
        const idx = this._myPriorities.indexOf(key);
        if (idx !== -1) { this._myPriorities.splice(idx, 1); chip.classList.remove('airbnb-pp-chip--active'); }
        else { if (this._myPriorities.length >= 5) return; this._myPriorities.push(key); chip.classList.add('airbnb-pp-chip--active'); }
        this._saveCollabPriorities();
        this._refreshAll();
      });
    });
  },

  _attachExtraListeners() {
    this.panel?.querySelectorAll('.airbnb-pp-extra-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        this._myPriorities = this._myPriorities.filter(k => k !== btn.dataset.key);
        this._saveCollabPriorities();
        this._refreshChips();
        this._refreshAll();
      });
    });
  },

  _attachGroupVoteListeners() {
    this.panel?.querySelectorAll('.airbnb-pp-group-vote-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        if (this._myPriorities.includes(key)) {
          this._myPriorities = this._myPriorities.filter(k => k !== key);
        } else {
          if (this._myPriorities.length >= 5) return;
          this._myPriorities.push(key);
        }
        this._saveCollabPriorities();
        this._refreshChips();
        this._refreshAll();
      });
    });
  },

  // ── Refresh ──────────────────────────────────────────────────────────────────

  _refreshChips() {
    const grid = this.panel?.querySelector('#airbnb-pp-chip-grid');
    if (grid) { grid.innerHTML = this._buildChipsHTML(); this._attachChipListeners(); }
    const extrasEl = this.panel?.querySelector('#airbnb-pp-extras');
    if (extrasEl) { extrasEl.innerHTML = this._buildExtrasHTML(); this._attachExtraListeners(); }
  },

  _refreshAll() {
    if (!this.panel) return;

    // Keep current user in participants for display
    if (this._userId) {
      this._participants[this._userId] = {
        ...(this._participants[this._userId] || {}),
        name: this._myName || 'Me',
        priorities: this._myPriorities,
      };
    }

    const top3El = this.panel.querySelector('#airbnb-pp-top3');
    if (top3El) top3El.innerHTML = this._buildRankingsHTML();

    this._refreshQuickCompare();

    const participantsEl = this.panel.querySelector('#airbnb-pp-participants');
    if (participantsEl) {
      participantsEl.innerHTML = this._buildGroupPrioritiesHTML();
      this._attachGroupVoteListeners();
    }

    const avRow = this.panel.querySelector('#airbnb-pp-av-row');
    if (avRow) avRow.innerHTML = Object.keys(this._participants).slice(0, 6).map(id => this._avatarHTML(id, 24)).join('');

    const count = Object.keys(this._participants).length;
    const countEl = this.panel.querySelector('.airbnb-pp-participant-count');
    if (countEl) countEl.textContent = `${count} member${count !== 1 ? 's' : ''}`;

    this._refreshIconBadge();

    const hint = this.panel.querySelector('#airbnb-pp-sync-hint');
    if (hint && count > 1 && hint.style.color !== 'rgb(192, 57, 43)') {
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      hint.textContent = `Last synced ${now} · Updates every 15s`;
    }
  },

  // ── Panel lifecycle ──────────────────────────────────────────────────────────

  _buildPanel() {
    if (this.panel) this.panel.remove();
    const panel = document.createElement('div');
    panel.id = 'airbnb-priorities-panel';
    panel.className = 'airbnb-pp-panel';
    panel.style.display = 'none';
    panel.innerHTML = this._buildHTML();
    const target = this._findInsertionTarget();
    const comparePanel = document.getElementById('airbnb-comparison-panel');
    const btnWrapper = document.getElementById('airbnb-compare-btn-wrapper');
    const gridContainer = this._findGridContainer();
    // Keep this panel adjacent to the Compare panel when both are open; otherwise
    // insert directly before the real listing grid so it pushes the grid down as a
    // normal-flow sibling, instead of overlapping it via the header/button area.
    if (comparePanel) comparePanel.after(panel);
    else if (gridContainer) gridContainer.parentElement.insertBefore(panel, gridContainer);
    else if (btnWrapper) btnWrapper.after(panel);
    else target.prepend(panel);
    this.panel = panel;
    this._attachListeners();
  },

  inject(wishlistKey, allListings) {
    this._wishlistKey = wishlistKey;
    this._allListings = allListings;
    this._sendMsg({ type: 'GET_USER_ID' }, (res) => {
      this._userId = res?.userId || null;
      chrome.storage.local.get(['collabUserName_' + this._userId], (r) => {
        this._myName = r['collabUserName_' + this._userId] || this._extractAirbnbUserName() || '';
        this._sendMsg({ type: 'GET_PRIORITIES', wishlistKey }, (legacyRes) => {
          this._myPriorities = legacyRes?.data?.myPriorities || [];
          this._fetchCollabPriorities(() => {
            this._injectIcon();
            this._buildPanel();
          });
        });
      });
    });
  },

  show() {
    if (!this.panel) this._buildPanel();
    this.panel.style.display = '';
    this._visible = true;
    this._iconBtn?.classList.add('airbnb-pp-icon-btn--active');
    this._saveCollabPriorities();
    this._fetchCollabPriorities(() => this._refreshAll());
    this._startPolling();
  },

  hide() {
    if (this.panel) this.panel.style.display = 'none';
    this._visible = false;
    this._iconBtn?.classList.remove('airbnb-pp-icon-btn--active');
    this._stopPolling();
  },

  update(allListings) {
    this._allListings = allListings;
    this._refreshChips();
    if (this._visible) this._refreshAll();
  },

  remove() {
    this._stopPolling();
    this.panel?.remove();
    this._iconBtn?.remove();
    this.panel = null; this._iconBtn = null; this._visible = false;
    this._myPriorities = []; this._participants = [];
    this._allListings = []; this._colorCache = {}; this._qcOverrides = {};
  },

  // ── Utilities ────────────────────────────────────────────────────────────────

  _sendMsg(msg, callback) {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) { if (callback) callback(null); return; }
    try {
      chrome.runtime.sendMessage(msg, (res) => {
        if (chrome.runtime.lastError) { if (callback) callback(null); return; }
        if (callback) callback(res);
      });
    } catch (e) { if (callback) callback(null); }
  },

  _esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  _timeAgo(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return Math.floor(diff / 86400000) + 'd ago';
  },
};
