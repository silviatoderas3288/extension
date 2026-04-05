// priorities-panel.js
// Collaborative Priorities panel — each user sets up to 5 priorities,
// all participants' picks are merged, and listings are ranked for the group.

window.PrioritiesPanel = {
  panel: null,
  _iconBtn: null,
  _visible: false,
  _wishlistKey: '',
  _allListings: [],

  // This user
  _userId: null,
  _myName: '',
  _myPriorities: [],

  // All participants fetched from Firebase (includes current user)
  _participants: {},      // { userId: { name, priorities, updatedAt } }
  _pollTimer: null,

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

  // ── Entry point ──────────────────────────────────────────────────────────────

  inject(wishlistKey, allListings) {
    this._wishlistKey = wishlistKey;
    this._allListings = allListings;

    // 1. Get stable user ID
    this._sendMsg({ type: 'GET_USER_ID' }, (res) => {
      this._userId = res?.userId || null;

      // 2. Restore local name from storage
      chrome.storage.local.get(['collabUserName_' + this._userId], (r) => {
        this._myName = r['collabUserName_' + this._userId] || '';

        // 3. Load saved local priorities (legacy / offline fallback)
        this._sendMsg({ type: 'GET_PRIORITIES', wishlistKey }, (legacyRes) => {
          this._myPriorities = legacyRes?.data?.myPriorities || [];

          // 4. Fetch all collaborators from Firebase
          this._fetchCollabPriorities(() => {
            this._injectIcon();
            this._buildPanel();
          });
        });
      });
    });
  },

  // ── Firebase sync ────────────────────────────────────────────────────────────

  _fetchCollabPriorities(callback) {
    this._sendMsg(
      { type: 'GET_COLLAB_PRIORITIES', wishlistKey: this._wishlistKey },
      (res) => {
        this._participants = res?.participants || {};

        // Merge my own remote priorities if they're newer than local
        if (this._userId && this._participants[this._userId]) {
          const remote = this._participants[this._userId];
          // Only overwrite local if we have no local selection yet
          if (this._myPriorities.length === 0 && remote.priorities?.length > 0) {
            this._myPriorities = remote.priorities;
          }
          if (!this._myName && remote.name) {
            this._myName = remote.name;
          }
        }

        if (callback) callback();
      }
    );
  },

  _saveCollabPriorities() {
    if (!this._userId) return;

    // Save name preference locally
    chrome.storage.local.set({ ['collabUserName_' + this._userId]: this._myName });

    // Save to Firebase
    this._sendMsg({
      type: 'SAVE_COLLAB_PRIORITIES',
      wishlistKey: this._wishlistKey,
      name: this._myName || 'Anonymous',
      priorities: this._myPriorities,
    }, () => {
      // Also keep legacy local storage in sync for offline fallback
      this._sendMsg({
        type: 'SAVE_PRIORITIES',
        wishlistKey: this._wishlistKey,
        data: { myPriorities: this._myPriorities },
      });
    });

    // Update local participants cache immediately so rankings refresh without waiting
    if (this._userId) {
      this._participants[this._userId] = {
        name: this._myName || 'Anonymous',
        priorities: this._myPriorities,
        updatedAt: Date.now(),
      };
    }
  },

  // Poll Firebase every 15 s while the panel is open
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

    btn.addEventListener('click', () => {
      this._visible ? this.hide() : this.show();
    });

    anchor.after(btn);
    this._iconBtn = btn;
    this._refreshIconBadge();
  },

  _refreshIconBadge() {
    if (!this._iconBtn) return;
    const count = Object.keys(this._participants).length;
    // Show participant count as a small badge if > 1
    let badge = this._iconBtn.querySelector('.airbnb-pp-badge');
    if (count > 1) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'airbnb-pp-badge';
        this._iconBtn.appendChild(badge);
      }
      badge.textContent = count;
    } else if (badge) {
      badge.remove();
    }
  },

  // ── Panel build ──────────────────────────────────────────────────────────────

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

    const participantsHTML = this._buildParticipantsHTML();
    const rankingsHTML = this._buildRankingsHTML();
    const wishlistUrl = window.location.href.split('?')[0];
    const participantCount = Object.keys(this._participants).length;

    return `
      <div class="airbnb-pp-header">
        <span class="airbnb-pp-title">Collaborative Priorities</span>
        ${participantCount > 0 ? `<span class="airbnb-pp-participant-count">${participantCount} participant${participantCount !== 1 ? 's' : ''}</span>` : ''}
        <button class="airbnb-pp-share-btn" id="airbnb-pp-share" title="Copy invite link">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          Share
        </button>
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
            <div class="airbnb-pp-amenity-grid">${chipsHTML}</div>
          </div>

          ${participantsHTML ? `
          <div class="airbnb-pp-section">
            <div class="airbnb-pp-section-label">Group Priorities</div>
            <div id="airbnb-pp-participants">${participantsHTML}</div>
          </div>` : ''}
        </div>

        <div class="airbnb-pp-right">
          <div class="airbnb-pp-section">
            <div id="airbnb-pp-top3">${rankingsHTML}</div>
          </div>
        </div>
      </div>

      <div class="airbnb-pp-footer">
        <span class="airbnb-pp-sync-hint" id="airbnb-pp-sync-hint">
          Share the wishlist link so others can join with the extension installed.
        </span>
      </div>
    `;
  },

  _buildParticipantsHTML() {
    const others = Object.entries(this._participants)
      .filter(([id]) => id !== this._userId);

    if (others.length === 0) return '';

    return others.map(([id, p]) => {
      const name = this._esc(p.name || 'Anonymous');
      const prios = (p.priorities || []).map(key => {
        const label = this._amenityList.find(a => a.key === key)?.label || key;
        return `<span class="airbnb-pp-other-chip">${label}</span>`;
      }).join('');
      const ago = this._timeAgo(p.updatedAt);
      return `
        <div class="airbnb-pp-participant">
          <div class="airbnb-pp-participant-header">
            <span class="airbnb-pp-participant-name">${name}</span>
            <span class="airbnb-pp-participant-ago">${ago}</span>
          </div>
          ${prios ? `<div class="airbnb-pp-other-chips">${prios}</div>` : '<span class="airbnb-pp-empty" style="font-size:12px">No priorities set yet</span>'}
        </div>
      `;
    }).join('');
  },

  _buildRankingsHTML() {
    // Merge all participants' priorities for group ranking
    const allParticipants = Object.entries(this._participants);

    // Include current user's latest selections even before saving
    const effectiveParticipants = [...allParticipants];
    if (this._userId) {
      const idx = effectiveParticipants.findIndex(([id]) => id === this._userId);
      const myEntry = [this._userId, { name: this._myName || 'Me', priorities: this._myPriorities }];
      if (idx === -1) effectiveParticipants.push(myEntry);
      else effectiveParticipants[idx] = myEntry;
    }

    const hasAnyPriorities = effectiveParticipants.some(([, p]) => p.priorities?.length > 0);

    if (!hasAnyPriorities) {
      return '<div class="airbnb-pp-empty">Pick priorities to see group recommendations.</div>';
    }

    const ranked = this._rankListingsForGroup(effectiveParticipants);

    if (ranked.length === 0) {
      return '<div class="airbnb-pp-empty">Amenity data loading — check back shortly.</div>';
    }

    const [first, ...rest] = ranked;
    const runnerUps = rest.slice(0, 2);
    const participantCount = effectiveParticipants.filter(([, p]) => p.priorities?.length > 0).length;
    const label = participantCount > 1 ? 'Best for the group' : 'Winner & Top 3';

    return `
      <div class="airbnb-pp-section-label" style="margin-bottom:10px">${label}</div>
      ${this._buildWinnerHTML(first, effectiveParticipants)}
      ${runnerUps.length ? `<div class="airbnb-pp-runners">${runnerUps.map((r, i) => this._buildRunnerUpHTML(r, i + 2, effectiveParticipants)).join('')}</div>` : ''}
    `;
  },

  _buildWinnerHTML(r, participants) {
    const l = r.listing;
    const photo = l.photo || '';
    const title = l.title || l.locationTitle || 'Listing';
    const pctLabel = Math.round(r.groupScore * 10) + '% group match';

    // Show per-user match breakdown
    const breakdown = participants
      .filter(([, p]) => p.priorities?.length > 0)
      .map(([id, p]) => {
        const name = p.name || 'Anonymous';
        const userMatches = r.perUserMatches[id] || { matched: 0, total: p.priorities.length };
        return `<span class="airbnb-pp-match-chip ${userMatches.matched > 0 ? 'airbnb-pp-match-chip--hit' : 'airbnb-pp-match-chip--miss'}">${this._esc(name)}: ${userMatches.matched}/${userMatches.total}</span>`;
      }).join('');

    return `
      <div class="airbnb-pp-winner">
        <div class="airbnb-pp-winner-crown">Winner</div>
        <div class="airbnb-pp-winner-body">
          ${photo ? `<img class="airbnb-pp-winner-photo" src="${photo}" alt="${this._esc(title)}" />` : ''}
          <div class="airbnb-pp-winner-info">
            <div class="airbnb-pp-winner-name">${this._esc(title)}</div>
            <div class="airbnb-pp-winner-meta">
              ${r.votes > 0 ? `<span class="airbnb-pp-winner-votes">👍 ${r.votes}</span>` : ''}
            </div>
            ${breakdown ? `<div class="airbnb-pp-rank-chips" style="margin-top:6px">${breakdown}</div>` : ''}
          </div>
        </div>
      </div>
    `;
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
          ${photo ? `<img class="airbnb-pp-runner-photo" src="${photo}" alt="${this._esc(title)}" />` : ''}
          <div class="airbnb-pp-rank-info">
            <div class="airbnb-pp-rank-name">${this._esc(title)}</div>
            <div class="airbnb-pp-rank-score">${r.votes > 0 ? `👍 ${r.votes}` : ''}</div>
          </div>
        </div>
      </div>
    `;
  },

  // ── Ranking logic ────────────────────────────────────────────────────────────
  // Group score = average across all participants of (their matched / their total)
  // Then +votes bonus. This gives every user equal weight regardless of how many priorities they set.

  _rankListingsForGroup(participants) {
    const activeParticipants = participants.filter(([, p]) => p.priorities?.length > 0);
    if (activeParticipants.length === 0) return [];

    const candidates = this._allListings.filter(l =>
      l.amenities && Object.keys(l.amenities).length > 0
    );
    if (candidates.length === 0) return [];

    return candidates
      .map(l => {
        const a = l.amenities || {};
        let totalScore = 0;
        const perUserMatches = {};

        for (const [id, p] of activeParticipants) {
          const priorities = p.priorities || [];
          const matched = priorities.filter(key => {
            if (key === 'cancellation') return a.cancellation && a.cancellation !== 'unknown';
            return a[key] === true;
          });
          perUserMatches[id] = { matched: matched.length, total: priorities.length };
          totalScore += priorities.length > 0 ? matched.length / priorities.length : 0;
        }

        const groupScore = totalScore / activeParticipants.length; // 0–1
        const votes = l.thumbsUp || 0;
        const finalScore = groupScore * 10 + votes * 2;

        return { listing: l, groupScore, finalScore, votes, perUserMatches };
      })
      .filter(r => r.finalScore > 0)
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, 3);
  },

  // ── Listeners ────────────────────────────────────────────────────────────────

  _attachListeners() {
    if (!this.panel) return;

    this.panel.querySelector('.airbnb-pp-close').addEventListener('click', () => this.hide());

    // Name input — debounced save
    let nameTimer = null;
    const nameInput = this.panel.querySelector('#airbnb-pp-name');
    nameInput?.addEventListener('input', () => {
      this._myName = nameInput.value.trim();
      clearTimeout(nameTimer);
      nameTimer = setTimeout(() => this._saveCollabPriorities(), 800);
    });

    // Share button — copies the wishlist URL
    this.panel.querySelector('#airbnb-pp-share')?.addEventListener('click', () => {
      const url = window.location.href.split('?')[0];
      navigator.clipboard.writeText(url).then(() => {
        const btn = this.panel.querySelector('#airbnb-pp-share');
        const orig = btn.innerHTML;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.innerHTML = orig; }, 2000);
      });
    });

    // Priority chips
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
        this._saveCollabPriorities();
        this._refreshAll();
      });
    });
  },

  _refreshAll() {
    if (!this.panel) return;

    const top3El = this.panel.querySelector('#airbnb-pp-top3');
    if (top3El) top3El.innerHTML = this._buildRankingsHTML();

    const participantsEl = this.panel.querySelector('#airbnb-pp-participants');
    if (participantsEl) participantsEl.innerHTML = this._buildParticipantsHTML();

    // Refresh participant count in header
    const countEl = this.panel.querySelector('.airbnb-pp-participant-count');
    const count = Object.keys(this._participants).length;
    if (countEl) countEl.textContent = `${count} participant${count !== 1 ? 's' : ''}`;

    this._refreshIconBadge();

    // Update sync hint with last-refreshed time
    const hint = this.panel.querySelector('#airbnb-pp-sync-hint');
    if (hint && count > 1) {
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      hint.textContent = `Last synced ${now} · Updates every 15s`;
    }
  },

  // ── Utilities ────────────────────────────────────────────────────────────────

  _sendMsg(msg, callback) {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      if (callback) callback(null);
      return;
    }
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

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  update(allListings) {
    this._allListings = allListings;
    if (this._visible) this._refreshAll();
  },

  show() {
    if (!this.panel) this._buildPanel();
    this.panel.style.display = '';
    this._visible = true;
    this._iconBtn?.classList.add('airbnb-pp-icon-btn--active');
    // Fetch latest from Firebase immediately on open
    this._fetchCollabPriorities(() => this._refreshAll());
    this._startPolling();
  },

  hide() {
    if (this.panel) this.panel.style.display = 'none';
    this._visible = false;
    this._iconBtn?.classList.remove('airbnb-pp-icon-btn--active');
    this._stopPolling();
  },

  remove() {
    this._stopPolling();
    this.panel?.remove();
    this._iconBtn?.remove();
    this.panel = null;
    this._iconBtn = null;
    this._visible = false;
    this._myPriorities = [];
    this._participants = {};
    this._allListings = [];
  },
};
