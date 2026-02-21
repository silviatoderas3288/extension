// content.js
// Main orchestrator — runs on airbnb.com/wishlists/*
// Coordinates scraper, check icons, compare button, and comparison panel

(function () {
  'use strict';

  // If the extension was reloaded while the tab was open, chrome.runtime is severed.
  // Bail out early to avoid uncaught errors from the stale script context.
  if (typeof chrome === 'undefined' || !chrome.runtime) return;

  let state = {
    selectedListings: [],
    compareActive: false,
    allListings: [],
  };

  let initialized = false;

  // ─── Initialization ────────────────────────────────────────────────────────

  function init() {
    if (initialized) return;

    // Wait for the listing cards to appear in the DOM
    waitForCards(() => {
      scrapeAndSetup();
      initialized = true;

      // Re-scrape when Airbnb lazy-loads more cards (React SPA)
      observeNewCards();
    });
  }

  function waitForCards(callback, retries = 20) {
    const cards = AirbnbScraper.findListingCards();
    if (cards.length > 0) {
      callback();
    } else if (retries > 0) {
      setTimeout(() => waitForCards(callback, retries - 1), 500);
    }
  }

  function scrapeAndSetup() {
    state.allListings = AirbnbScraper.scrapeAll();
    if (state.allListings.length === 0) return;

    // Inject Compare button
    CompareButton.inject((active) => onCompareToggle(active));

    // Inject check icons on cards
    CheckIcon.injectAll(state.allListings, (listing, isSelected) => {
      onCheckToggle(listing, isSelected);
    });
  }

  // ─── Observe new cards (infinite scroll / React re-renders) ────────────────

  function observeNewCards() {
    const grid = document.querySelector('main') || document.body;
    const observer = new MutationObserver(() => {
      const freshListings = AirbnbScraper.scrapeAll();
      const newListings = freshListings.filter(
        (fl) => !state.allListings.find((al) => al.id === fl.id)
      );
      if (newListings.length > 0) {
        state.allListings = [...state.allListings, ...newListings];
        CheckIcon.injectAll(newListings, (listing, isSelected) => {
          onCheckToggle(listing, isSelected);
        });
        // Sync disabled state if 3 already selected
        syncCheckStates();
      }
    });
    observer.observe(grid, { childList: true, subtree: true });
  }

  // ─── Event Handlers ────────────────────────────────────────────────────────

  function onCheckToggle(listing, isSelected) {
    if (isSelected) {
      if (state.selectedListings.length >= 3) return;
      if (!state.selectedListings.find((l) => l.id === listing.id)) {
        state.selectedListings.push(listing);
        // Fetch amenities for this listing in background
        fetchAmenities(listing);
      }
    } else {
      state.selectedListings = state.selectedListings.filter((l) => l.id !== listing.id);
    }

    syncCheckStates();

    // Keep panel in sync if open
    if (state.compareActive) {
      if (state.selectedListings.length === 0) {
        state.compareActive = false;
        CompareButton.setActive(false);
        ComparisonPanel.hide();
      } else {
        refreshPanel();
      }
    }
  }

  function onCompareToggle(active) {
    state.compareActive = active;
    CompareButton.setActive(active);

    if (active) {
      // Auto-select top 3 if nothing is checked
      if (state.selectedListings.length === 0) {
        state.selectedListings = state.allListings.slice(0, 3);
        syncCheckStates();
      }
      state.selectedListings.forEach((l) => fetchAmenities(l));
      showPanel();
    } else {
      ComparisonPanel.hide();
    }
  }

  function onPanelSwap(slotIndex, newListing) {
    // Replace the listing at this slot; remove it from any other slot first
    const existingSlot = state.selectedListings.findIndex((l) => l.id === newListing.id);
    if (existingSlot !== -1 && existingSlot !== slotIndex) {
      // Swap the two slots
      const prev = state.selectedListings[slotIndex];
      state.selectedListings[existingSlot] = prev;
      state.selectedListings[slotIndex] = newListing;
    } else {
      state.selectedListings[slotIndex] = newListing;
    }
    fetchAmenities(newListing);
    syncCheckStates();
    refreshPanel();
  }

  function onPanelDeselect(listingId) {
    if (listingId === null) {
      // Close button clicked — hide panel, deactivate compare, keep selections
      state.compareActive = false;
      CompareButton.setActive(false);
      ComparisonPanel.hide();
      return;
    }
    // Remove from selected and uncheck the card icon
    state.selectedListings = state.selectedListings.filter((l) => l.id !== listingId);
    syncCheckStates();
    if (state.selectedListings.length === 0) {
      // No more selections — close everything
      state.compareActive = false;
      CompareButton.setActive(false);
      ComparisonPanel.hide();
    } else {
      refreshPanel();
    }
  }

  // ─── Panel ─────────────────────────────────────────────────────────────────

  function showPanel() {
    ComparisonPanel.show(
      state.selectedListings,
      state.allListings,
      onPanelSwap,
      onPanelDeselect
    );
  }

  function refreshPanel() {
    if (!state.compareActive) return;
    ComparisonPanel.update(
      state.selectedListings,
      state.allListings,
      onPanelSwap,
      onPanelDeselect
    );
  }

  // ─── Check icon sync ───────────────────────────────────────────────────────

  function syncCheckStates() {
    const selectedIds = state.selectedListings.map((l) => l.id);
    const maxReached = selectedIds.length >= 3;

    state.allListings.forEach((listing) => {
      if (selectedIds.includes(listing.id)) {
        CheckIcon.setState(listing.id, 'filled');
      } else if (maxReached) {
        CheckIcon.setState(listing.id, 'none');
      } else {
        CheckIcon.setState(listing.id, 'unfilled');
      }
    });
  }

  // ─── Amenity fetching ──────────────────────────────────────────────────────

  function fetchAmenities(listing) {
    if (listing.amenities) return; // already fetched

    // Guard against extension context not being ready
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      listing.amenities = {};
      return;
    }

    try {
      console.log('[Extension] Requesting amenities for:', listing.url);
      chrome.runtime.sendMessage(
        { type: 'FETCH_AMENITIES', listingUrl: listing.url, listingId: listing.id },
        (response) => {
          if (chrome.runtime.lastError) return; // extension reloaded mid-flight
          if (response?.amenities) {
            listing.amenities = response.amenities;
            const match = state.allListings.find((l) => l.id === listing.id);
            if (match) match.amenities = response.amenities;
            if (state.compareActive) refreshPanel();
          }
        }
      );
    } catch (e) {
      listing.amenities = {};
    }
  }

  // ─── Boot ──────────────────────────────────────────────────────────────────

  // Airbnb is a React SPA — wait for DOM ready then init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Handle Airbnb's client-side navigation (pushState)
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      if (location.pathname.includes('/wishlists/')) {
        initialized = false;
        state = { selectedListings: [], compareActive: false, allListings: [] };
        ComparisonPanel.hide();
        CompareButton.remove();
        setTimeout(init, 800);
      }
    }
  }).observe(document, { subtree: true, childList: true });
})();
