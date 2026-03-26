// compare-button.js
// Injects the "Compare" pill button into the Airbnb wishlist trip header

window.CompareButton = {
  button: null,
  _wrapper: null,

  /**
   * Find the row that contains the "Add dates / guests / Share" buttons.
   * This is the row we want to put Compare on the far right of.
   */
  _findButtonRow() {
    // The Share button is a direct child of the flex row — its parentElement IS the flex container
    const shareBtn = document.querySelector('[data-el="share-wishlist"]');
    if (shareBtn) return shareBtn.parentElement;

    // Fallback: the first non-labelled div child of #filter-menu-chip-group
    const chipsRow = document.querySelector('#filter-menu-chip-group > div:not([id])');
    if (chipsRow) return chipsRow;

    return null;
  },

  /**
   * Create and inject the Compare button, right-aligned in the header row.
   * @param {Function} onClick - callback when Compare is clicked
   */
  inject(onClick) {
    if (this.button) return; // already injected

    const row = this._findButtonRow();
    if (!row) return;

    const btn = document.createElement('button');
    btn.id = 'airbnb-compare-btn';
    btn.textContent = 'Quick Compare';
    btn.className = 'airbnb-compare-btn';
    btn.setAttribute('aria-pressed', 'false');

    btn.addEventListener('click', () => {
      const active = btn.getAttribute('aria-pressed') === 'true';
      onClick(!active);
    });

    row.appendChild(btn);
    this.button = btn;
    this._wrapper = btn;
  },

  /**
   * Toggle the button's active state (filled pink vs outlined).
   */
  setActive(active) {
    if (!this.button) return;
    this.button.setAttribute('aria-pressed', String(active));
    this.button.classList.toggle('airbnb-compare-btn--active', active);
  },

  remove() {
    this._wrapper?.remove();
    this.button = null;
    this._wrapper = null;
  },
};
