// compare-button.js
// Injects the "Compare" pill button just below the dates/header row

window.AirbnbCompare = window.AirbnbCompare || {};
window.AirbnbCompare.CompareButton = {
  button: null,
  _wrapper: null,

  /**
   * Find the flex row that contains the Share / dates / guests buttons.
   * Inserting after this row places the button visually below it (under the dates button).
   */
  _findHeaderRow() {
    const shareBtn = document.querySelector('[data-el="share-wishlist"]');
    if (shareBtn) return shareBtn.parentElement;
    const chipsRow = document.querySelector('#filter-menu-chip-group > div:not([id])');
    if (chipsRow) return chipsRow;
    return null;
  },

  /**
   * Create and inject the Compare button right below the dates/header row.
   * @param {Function} onClick - callback when Compare is clicked
   */
  inject(onClick) {
    if (this.button) return; // already injected

    const btn = document.createElement('button');
    btn.id = 'airbnb-compare-btn';
    btn.textContent = 'Compare';
    btn.className = 'airbnb-compare-btn';
    btn.setAttribute('aria-pressed', 'false');

    btn.addEventListener('click', () => {
      const active = btn.getAttribute('aria-pressed') === 'true';
      onClick(!active);
    });

    const wrapper = document.createElement('div');
    wrapper.id = 'airbnb-compare-btn-wrapper';
    wrapper.className = 'airbnb-compare-btn-wrapper';
    wrapper.appendChild(btn);

    const headerRow = this._findHeaderRow();
    if (headerRow) {
      // Insert right after the header row so Compare sits below the dates button
      headerRow.insertAdjacentElement('afterend', wrapper);
    } else {
      document.body.prepend(wrapper);
    }

    this.button = btn;
    this._wrapper = wrapper;
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
