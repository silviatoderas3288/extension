// background.js — service worker entry point
// Routes chrome.runtime.onMessage to the appropriate module.

import { tabState, initTabState, getTabKey } from './background/state.js';
import {
  getFirebaseUrl, setFirebaseUrl,
  wishlistDbKey, getOrCreateUserId,
  firebaseGet, firebasePut, firebaseDelete, firebaseTransaction,
} from './background/firebase.js';
import { parseAmenitiesFromHtml, fetchAmenities } from './background/parser.js';

// On first install: seed the Firebase URL into storage so it can be updated
// from the popup without touching source code.
chrome.runtime.onInstalled.addListener(async () => {
  const stored = await new Promise(r => chrome.storage.local.get('firebaseDbUrl', r));
  if (!stored.firebaseDbUrl) {
    await setFirebaseUrl('https://extension-dbf07-default-rtdb.firebaseio.com');
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabState[getTabKey(tabId)];
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  _handleMessage(message, sender, sendResponse)
    .catch(e => {
      console.error('[Extension] Unhandled error for', message?.type, ':', e);
      sendResponse({ error: e.message || 'Internal error' });
    });
  return true; // keep channel open for all async responses
});

// Message types that don't require an associated tab (no per-tab comparison
// state involved) — collab/priorities messages can come from the popup too.
const TAB_OPTIONAL_TYPES = new Set([
  'GET_USER_ID', 'GET_COLLAB_PRIORITIES', 'GET_GROUP_DATA', 'ADD_PRIORITY',
  'TOGGLE_VOTE', 'DELETE_PRIORITY', 'DELETE_COLLAB_PARTICIPANT',
  'SAVE_COLLAB_PRIORITIES', 'GET_PRIORITIES', 'SAVE_PRIORITIES',
]);

async function _handleMessage(message, sender, sendResponse) {
  const tabId = sender.tab?.id;
  if (!tabId && !TAB_OPTIONAL_TYPES.has(message?.type)) {
    sendResponse({ error: 'No associated tab for message type ' + message?.type });
    return;
  }

  const state = tabId ? initTabState(tabId) : null;

  // Shared context for the Firebase-backed collab cases below — computed
  // once per message instead of re-deriving dbKey/userId in every case.
  const dbKey = wishlistDbKey(message.wishlistKey || 'default');

  switch (message.type) {

    case 'GET_STATE':
      sendResponse({ state });
      break;

    case 'SELECT_LISTING': {
      const listing = message.listing;
      if (!listing || !listing.id) {
        sendResponse({ error: 'SELECT_LISTING requires a listing with an id', state });
        break;
      }
      const exists = state.selectedListings.find(l => l.id === listing.id);
      if (!exists && state.selectedListings.length < 3) {
        state.selectedListings.push(listing);
      }
      sendResponse({ state });
      break;
    }

    case 'DESELECT_LISTING': {
      state.selectedListings = state.selectedListings.filter(l => l.id !== message.listingId);
      sendResponse({ state });
      break;
    }

    case 'SET_COMPARE_ACTIVE': {
      state.compareActive = message.active;
      sendResponse({ state });
      break;
    }

    case 'SWAP_LISTING': {
      const { slotIndex, listing } = message;
      if (!listing || !listing.id || !Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 2) {
        sendResponse({ error: 'SWAP_LISTING requires a listing with an id and slotIndex 0-2', state });
        break;
      }
      state.selectedListings = state.selectedListings.filter(l => l.id !== listing.id);
      state.selectedListings[slotIndex] = listing;
      sendResponse({ state });
      break;
    }

    case 'FETCH_AMENITIES': {
      // Legacy: bg fetches without cookies — kept as fallback only
      fetchAmenities(message.listingUrl)
        .then(amenities => sendResponse({ amenities }))
        .catch(() => sendResponse({ amenities: {} }));
      break;
    }

    case 'PARSE_AMENITIES': {
      // Preferred: content script fetches with cookies, sends HTML here for parsing
      try {
        const amenities = parseAmenitiesFromHtml(message.html, message.listingUrl);
        sendResponse({ amenities });
      } catch (e) {
        console.error('[Extension] PARSE_AMENITIES error:', e);
        sendResponse({ amenities: {} });
      }
      break;
    }

    // ── Legacy local-only priorities (chrome.storage.sync) ───────────────────
    case 'GET_PRIORITIES': {
      const storageKey = 'priorities_' + (message.wishlistKey || '').replace(/\//g, '_');
      chrome.storage.sync.get(storageKey, result => {
        sendResponse({ data: result[storageKey] || null });
      });
      break;
    }

    case 'SAVE_PRIORITIES': {
      const storageKey = 'priorities_' + (message.wishlistKey || '').replace(/\//g, '_');
      chrome.storage.sync.set({ [storageKey]: message.data }, () => {
        sendResponse({ ok: true });
      });
      break;
    }

    // ── Collaborative priorities (Firebase-backed) ────────────────────────────
    case 'GET_USER_ID': {
      const userId = await getOrCreateUserId();
      sendResponse({ userId });
      break;
    }

    case 'GET_COLLAB_PRIORITIES': {
      // GET wishlists/{key}/participants
      const participants = await firebaseGet(`wishlists/${dbKey}/participants`);
      sendResponse({ participants: participants || {} });
      break;
    }

    case 'GET_GROUP_DATA': {
      // GET wishlists/{key}/participants
      // GET wishlists/{key}/priorities
      const [participants, priorities] = await Promise.all([
        firebaseGet(`wishlists/${dbKey}/participants`),
        firebaseGet(`wishlists/${dbKey}/priorities`),
      ]);
      sendResponse({ participants: participants || {}, priorities: priorities || {} });
      break;
    }

    case 'ADD_PRIORITY': {
      // PUT wishlists/{key}/priorities/{priorityId}
      // Body: { text, addedBy, votes: { userId: true }, createdAt }
      const userId = await getOrCreateUserId();
      const priorityId = 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const result = await firebasePut(`wishlists/${dbKey}/priorities/${priorityId}`, {
        text: message.text,
        addedBy: userId,
        votes: { [userId]: true },
        createdAt: Date.now(),
      });
      sendResponse({ ok: result.ok, priorityId });
      break;
    }

    case 'TOGGLE_VOTE': {
      // Atomic read-modify-write on the votes map via ETag transaction.
      // Prevents double-vote races when two rapid clicks both see stale state.
      // PUT/DELETE wishlists/{key}/priorities/{priorityId}/votes
      const userId = await getOrCreateUserId();
      const result = await firebaseTransaction(
        `wishlists/${dbKey}/priorities/${message.priorityId}/votes`,
        (currentVotes) => {
          const votes = { ...(currentVotes || {}) };
          if (message.voted) {
            votes[userId] = true;
          } else {
            delete votes[userId];
          }
          return Object.keys(votes).length === 0 ? null : votes;
        }
      );
      sendResponse({ ok: result.ok });
      break;
    }

    case 'DELETE_PRIORITY': {
      // DELETE wishlists/{key}/priorities/{priorityId}
      const result = await firebaseDelete(`wishlists/${dbKey}/priorities/${message.priorityId}`);
      sendResponse({ ok: result.ok });
      break;
    }

    case 'DELETE_COLLAB_PARTICIPANT': {
      // DELETE wishlists/{key}/participants/{participantId}
      const result = await firebaseDelete(`wishlists/${dbKey}/participants/${message.participantId}`);
      sendResponse({ ok: result.ok });
      break;
    }

    case 'SAVE_COLLAB_PRIORITIES': {
      // PUT wishlists/{key}/participants/{userId}
      // Body: { name, priorities[], updatedAt }
      const userId = await getOrCreateUserId();
      const result = await firebasePut(`wishlists/${dbKey}/participants/${userId}`, {
        name: message.name || 'Anonymous',
        priorities: message.priorities || [],
        updatedAt: Date.now(),
      });
      sendResponse({ ok: result.ok, userId, status: result.status, error: result.error });
      break;
    }

    default:
      sendResponse({ error: 'Unknown message type' });
  }
}
