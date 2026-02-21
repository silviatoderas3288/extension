// popup.js
// Reads the current tab's selected listings from the background and renders them

document.addEventListener('DOMContentLoaded', async () => {
  const countEl = document.getElementById('selected-count');
  const listEl = document.getElementById('listings-list');
  const emptyEl = document.getElementById('empty-state');
  const compareBtn = document.getElementById('compare-btn');
  const tipEl = document.getElementById('tip');

  // Get active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.url?.includes('airbnb.com/wishlists')) {
    showEmpty('Navigate to an Airbnb wishlist to use this extension.');
    return;
  }

  // Request state from background
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
    const state = response?.state;
    if (!state) {
      showEmpty('Could not read comparison state.');
      return;
    }

    const { selectedListings } = state;
    const count = selectedListings.length;

    countEl.textContent = count;

    // Progress dots
    for (let i = 0; i < 3; i++) {
      const dot = document.getElementById(`dot-${i}`);
      if (i < count) dot.classList.add('progress-dot--filled');
      else dot.classList.remove('progress-dot--filled');
    }

    if (count === 0) {
      showEmpty('Select listings on the wishlist page using the ✓ icon on each card.');
      return;
    }

    emptyEl.style.display = 'none';
    tipEl.textContent = count < 2 ? 'Select at least 2 to compare.' : 'Click "Compare Now" or use the Compare button on the page.';

    // Render listing items
    listEl.innerHTML = selectedListings
      .map(
        (l) => `
        <div class="listing-item">
          ${l.photo ? `<img class="listing-item-photo" src="${l.photo}" alt="${l.title}" />` : '<div class="listing-item-photo"></div>'}
          <div class="listing-item-info">
            <div class="listing-item-name">${l.title}</div>
            <div class="listing-item-price">${l.priceText || ''}</div>
          </div>
          <button class="listing-item-remove" data-id="${l.id}" title="Remove">✕</button>
        </div>
      `
      )
      .join('');

    // Remove buttons
    listEl.querySelectorAll('.listing-item-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        chrome.runtime.sendMessage({ type: 'DESELECT_LISTING', listingId: id }, () => {
          // Notify content script to sync
          chrome.tabs.sendMessage(tab.id, { type: 'SYNC_STATE' });
          window.close();
        });
      });
    });

    // Compare Now button
    compareBtn.disabled = count < 2;
    compareBtn.addEventListener('click', () => {
      chrome.tabs.sendMessage(tab.id, { type: 'OPEN_COMPARE_PANEL' });
      window.close();
    });
  });

  function showEmpty(msg) {
    emptyEl.style.display = 'block';
    emptyEl.querySelector('span + *') && (emptyEl.querySelector('span').nextSibling.textContent = msg);
    listEl.innerHTML = '';
    compareBtn.disabled = true;
    tipEl.textContent = msg;
  }
});
