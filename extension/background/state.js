// background/state.js — per-tab comparison state
// Lifetime: service worker session (cleared on SW restart or tab close).

export const tabState = {};

export function getTabKey(tabId) {
  return `tab_${tabId}`;
}

export function initTabState(tabId) {
  const key = getTabKey(tabId);
  if (!tabState[key]) {
    tabState[key] = {
      selectedListings: [],
      compareActive: false,
    };
  }
  return tabState[key];
}
