# Airbnb Wishlist Compare — Project Summary

## What This Is

A Chrome browser extension (Manifest V3) that enhances Airbnb wishlist pages with:
- **Side-by-side listing comparison** (up to 3 listings)
- **Filtering & sorting** by price, beds, baths, guests, rating, amenities, cancellation policy
- **Collaborative trip priorities** — group members set priorities, extension ranks listings that best match the group's combined needs
- **Firebase-backed real-time sync** — priority votes persist across devices and users

---

## Tech Stack

| Layer | Technology |
|---|---|
| Platform | Chrome Extension (Manifest V3) |
| Language | Vanilla JavaScript (ES6+) — no build step, no TypeScript |
| Runtime architecture | Content scripts + background service worker |
| Persistent storage | Chrome `storage.local` (user ID, username), Chrome `storage.sync` (legacy priorities) |
| Real-time sync | Firebase Realtime Database (REST API) |
| Data source | Airbnb DOM scraping + HTML parsing (`__NEXT_DATA__` JSON blobs, RSC payloads) |
| UI | Injected HTML/CSS, inline SVG icons (Font Awesome 6) |
| Communication | `chrome.runtime.sendMessage` (content ↔ background) |

No npm, no webpack, no TypeScript compiler. Scripts load in dependency order via `manifest.json`.

---

## Project Structure

```
extension/
├── manifest.json           # Extension config: permissions, host rules, script injection order
├── background.js           # Service worker entry point: message router (ES module)
├── background/
│   ├── state.js            # Per-tab comparison state (selectedListings, compareActive)
│   ├── firebase.js         # Firebase REST helpers: get/put/delete/transaction, URL from storage
│   └── parser.js           # parseAmenitiesFromHtml() + price extraction strategies
│
├── content/
│   ├── content.js          # MAIN ORCHESTRATOR — boot, SPA navigation, coordinates all panels
│   └── scraper.js          # DOM scraper — extracts listing data from Airbnb card elements
│
├── ui/                     # All UI panels are window globals, loaded in order by manifest
│   ├── check-icon.js       # Circular ✓ badge injected on each listing card photo
│   ├── compare-button.js   # "Quick Compare" pill button injected in the content area
│   ├── comparison-panel.js # Side-by-side 3-column comparison panel (price, amenity grid)
│   ├── filter-panel.js     # Filter bar: price range, beds/baths/guests steppers, amenity multiselect
│   └── priorities-panel.js # Collaborative priorities: chips, group voting, listing rankings
│
├── popup/
│   ├── popup.html          # Extension toolbar popup
│   └── popup.js            # Shows selected listings, progress dots, Compare Now button
│
├── assets/
│   └── *.svg               # Check icon SVG states (filled, unfilled, none)
│
├── icons/                  # Extension icon sizes (16, 48, 128)
│
└── skills/                 # Reference docs for patterns used in this codebase
    ├── postgress-skills.md  # PostgreSQL schema design reference
    ├── design-system.md
    ├── api-conventions.md
    └── ...
```

---

## Architecture Diagram

```
Airbnb Wishlist Page (https://www.airbnb.com/wishlists/*)
│
├── Injected content scripts (run_at: document_idle)
│   ├── scraper.js          ← reads listing cards from DOM
│   ├── compare-button.js   ← injects Compare button
│   ├── check-icon.js       ← injects ✓ badges on cards
│   ├── comparison-panel.js ← renders 3-column panel
│   ├── priorities-panel.js ← renders priorities + ranking
│   ├── filter-panel.js     ← renders filter bar
│   └── content.js          ← BOOT: ties all of the above together
│
└── background.js (service worker, ES module)
    ├── background/state.js — Tab state (in-memory, per tabId)
    │   └── { selectedListings[], compareActive }
    ├── background/parser.js — Amenity parser
    │   └── Parses __NEXT_DATA__ JSON blobs sent from content script
    └── background/firebase.js — Firebase REST calls (URL from chrome.storage)
        ├── GET    wishlists/{key}/participants
        ├── PUT    wishlists/{key}/participants/{userId}
        ├── PUT    wishlists/{key}/priorities/{priorityId}
        ├── TXN    wishlists/{key}/priorities/{id}/votes  (ETag transaction)
        └── DELETE ...

Chrome Storage
├── storage.local: collabUserId, collabUserName_{userId}
└── storage.sync:  priorities_{wishlistKey} (legacy fallback)

Firebase Realtime Database
└── wishlists/
    └── {wishlistKey}/
        ├── participants/
        │   └── {userId}: { name, priorities[], updatedAt }
        └── priorities/
            └── {priorityId}: { text, addedBy, votes: { userId: true }, createdAt }
```

---

## Data Flow — How a Listing Gets Its Amenities

```
1. scraper.js reads card DOM → listing object { id, url, title, price, beds, rating, photo, ... }
2. content.js calls fetchAmenities(listing)
3. Content script fetches listing page HTML (with Airbnb cookies → full __NEXT_DATA__)
4. Sends HTML to background.js via PARSE_AMENITIES message
5. background.js runs parseAmenitiesFromHtml():
   - Extracts beds, baths, maxGuests, nightlyPrice
   - Extracts full amenity list from __NEXT_DATA__ JSON blob
   - Falls back to RSC payload chunks, then raw HTML keyword search
6. Result stored on listing.amenities = { beds, baths, maxGuests, nightlyPrice, wifi, pool, ..., allAmenities[] }
7. UI panels re-render with updated data
```

---

## Schema Design Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        AIRBNB WISHLIST COMPARE — DATA MODEL                     │
└─────────────────────────────────────────────────────────────────────────────────┘

  TIER 1: In-Memory (background service worker, per-tab, ephemeral)
  ─────────────────────────────────────────────────────────────────
  tabState[tabId]
  ┌──────────────────────────────────┐
  │  tabId: number (PK, natural)     │
  │  compareActive: boolean          │
  │  selectedListings: Listing[0..3] │──────────┐
  └──────────────────────────────────┘          │
                                                ▼
                                    Listing (scraped, no persistence)
                                    ┌────────────────────────────────────┐
                                    │  id: string (PK, natural — room ID)│
                                    │  url: string NOT NULL              │
                                    │  title: string NOT NULL            │
                                    │  price: string | null              │
                                    │  nightlyPrice: number | null       │
                                    │  beds: number | null               │
                                    │  baths: number | null              │
                                    │  maxGuests: number | null          │
                                    │  rating: number | null             │
                                    │  reviewCount: number | null        │
                                    │  photo: string | null              │
                                    │  badge: string | null              │
                                    │  amenities: AmenitySet | null      │──┐
                                    └────────────────────────────────────┘  │
                                                                             ▼
                                                             AmenitySet (lazy-loaded)
                                                             ┌──────────────────────┐
                                                             │  wifi: boolean       │
                                                             │  pool: boolean       │
                                                             │  kitchen: boolean    │
                                                             │  washer: boolean     │
                                                             │  ... (~20 fields)    │
                                                             │  allAmenities: str[] │
                                                             └──────────────────────┘


  TIER 2: Chrome Storage (persistent, per-device, per-browser-profile)
  ─────────────────────────────────────────────────────────────────────
  storage.local
  ┌──────────────────────────────────┐
  │  collabUserId: string (PK)       │  ← "u_" + random36 + timestamp36
  │  collabUserName_{userId}: string │  ← keyed by user ID
  └──────────────────────────────────┘

  storage.sync  (legacy, still read on load)
  ┌──────────────────────────────────┐
  │  priorities_{wishlistKey}: obj   │  ← { myPriorities: string[] }
  └──────────────────────────────────┘


  TIER 3: Firebase Realtime Database (persistent, shared, real-time)
  ──────────────────────────────────────────────────────────────────

  wishlists/{wishlistKey}                    ← natural key from URL path
  │
  ├── participants/
  │   └── {userId}                           ← FK → storage.local.collabUserId
  │       ┌────────────────────────────────┐
  │       │  name: string NOT NULL         │
  │       │  priorities: string[0..5]      │──── soft-ref to priorities/{id}
  │       │  updatedAt: number NOT NULL    │     (denormalized, no hard FK)
  │       └────────────────────────────────┘
  │
  └── priorities/
      └── {priorityId}                       ← "p_" + timestamp36 + random36
          ┌────────────────────────────────┐
          │  text: string NOT NULL         │
          │  addedBy: string NOT NULL      │──── soft-ref to participants/{userId}
          │  createdAt: number NOT NULL    │     (no cascade delete)
          │  votes: VoteMap                │
          └────────────────────────────────┘
               │
               ▼
          VoteMap (map, not array — prevents double-vote)
          ┌────────────────────────────────┐
          │  {userId}: true                │  ← membership sentinel
          │  {userId}: true                │
          └────────────────────────────────┘


  RELATIONSHIPS
  ─────────────
  tabState          → Listing             1 : 0..3  (max 3 per tab)
  wishlistKey       → participants        1 : N     (one wishlist, many users)
  wishlistKey       → priorities          1 : N     (one wishlist, many nominations)
  participants      → priorities (votes)  M : N     (via votes map, not join table)
  participants.priorities[] → priorities  M : N     (denormalized soft-ref, personal prefs)
  priority.addedBy  → participants        N : 1     (creator, no FK constraint)


  INTEGRITY ENFORCEMENT (app-level, no DB constraints)
  ─────────────────────────────────────────────────────
  ┌─────────────────────────────────────┬────────────────────────────────────┐
  │  Rule                               │  Enforced in                       │
  ├─────────────────────────────────────┼────────────────────────────────────┤
  │  Max 3 listings selected per tab    │  background.js SELECT_LISTING      │
  │  Max 5 priorities per user          │  priorities-panel.js + every save  │
  │  User ID stable per browser         │  GET_USER_ID handler               │
  │  Votes are per-user unique          │  Map key = userId (structural)      │
  │  Wishlist key path-safe             │  wishlistDbKey() encodes special ch │
  └─────────────────────────────────────┴────────────────────────────────────┘
```

---

## Data Storage Design (Answering the Data Question Space)

### Schema design

There is no relational database. Data lives in three tiers:

**1. In-memory tab state** (background.js `tabState` object):
```
tabState[tab_N] = {
  selectedListings: [listing, listing, listing],  // max 3
  compareActive: boolean
}
```
- Lost on tab close (intentional — compare state is ephemeral)
- Natural key: listing ID (Airbnb room ID, e.g. `"12345678"`)

**2. Chrome storage** (persistent, per-device):
```
storage.local:
  collabUserId: "u_abc123def"       ← stable per-browser identity
  collabUserName_u_abc: "Alice"     ← user's display name

storage.sync:
  priorities_{wishlistKey}: { myPriorities: ["wifi", "pool"] }  ← legacy
```

**3. Firebase Realtime Database** (persistent, shared across users):
```
wishlists/{wishlistKey}/
  participants/{userId}:
    name: "Alice"
    priorities: ["wifi", "pool", "kitchen"]   ← up to 5 items
    updatedAt: 1714000000000

  priorities/{priorityId}:
    text: "Close to beach"
    addedBy: "u_abc123"
    votes: { u_abc123: true, u_def456: true }
    createdAt: 1714000000000
```

### Why this structure?

- **Flat/denormalized Firebase tree** — Firebase Realtime Database is a JSON tree, not relational. Deep nesting causes over-fetching; flat nesting allows targeted reads.
- **Priorities stored on each participant AND in a shared priorities collection** — this is intentional duplication. `participants/{userId}.priorities` represents "what I care about" (personal preferences); the shared `priorities/{id}` collection represents "things the group has nominated with vote counts." They serve different queries.
- **`votes` as a map `{ userId: true }` not an array** — Firebase maps support atomic membership operations. A map key is unique per user, preventing double-votes. Arrays in Firebase require reading the full array to check membership.

### Primary keys

| Entity | Key type | Format | Why |
|---|---|---|---|
| User | Surrogate | `u_` + random36 + timestamp36 | Never exposed externally, generated without coordination |
| Priority | Surrogate | `p_` + timestamp36 + random36 | Sortable by creation time via timestamp prefix |
| Listing | Natural | Airbnb room ID (numeric string) | Stable, from Airbnb URL, never changes |
| Wishlist | Natural | URL pathname slug | From `window.location.pathname`, e.g. `/wishlists/abc-123` |

**Why not UUIDs?** This is a client-side extension with no backend coordination. Random strings generated in the browser are sufficient for uniqueness at this scale. Firebase keys can't contain `.#$[]/`, so path-safe encoding is applied via `wishlistDbKey()`.

### Nullable vs non-nullable fields

In the listing object:
- `id`, `url`, `title` — always populated (scraper returns `null` for the whole card if missing)
- `rating`, `reviewCount`, `photo`, `badge` — nullable (not all cards show these)
- `amenities` — starts as `null`, populated lazily after fetch; consumers always guard with `listing.amenities || {}`
- `nightlyPrice` — nullable; present if dates are selected on Airbnb

In Firebase:
- `name`, `priorities`, `updatedAt` — always written together in `SAVE_COLLAB_PRIORITIES`
- `votes` map — starts with `{ addedBy: true }`, can grow or shrink to empty

### Normalization vs denormalization

**What is denormalized:**
- `participants/{userId}.priorities[]` is an array of priority keys (e.g. `["wifi", "pool"]`). These same keys exist in the `priorities/` collection. The user's priorities are copied into their participant entry rather than referenced by ID.

**Why:**
- Reading a user's priorities requires only one Firebase read (`/participants/{userId}`) instead of a join
- The priorities collection is for group-level voting/discovery; the participant entry is for personal preferences
- At the scale of a trip wishlist (5–20 participants), duplication cost is negligible

**Consistency risk:**
- If a `priorities/{id}` entry is deleted, the key can still exist in `participants/{userId}.priorities[]`
- The ranking algorithm in `_rankListingsForGroup()` treats unknown keys as amenity keys and looks them up in `FilterPanel._amenityMap`, so stale keys silently become dead weight rather than crashing

**When this would break:**
- At scale, you'd want a cleanup job. For this use case (1 trip, ~5 people), it's acceptable to leave stale entries.

### Indexing

Firebase Realtime Database handles its own B-tree indexes on path segments. There are no explicit `.indexOn` rules configured.

**What this means for queries:**
- Reading `/wishlists/{key}/participants` — efficient (one path read)
- Querying "all wishlists where participant X exists" — **not possible** without a full scan; not a required query
- If this moved to a relational DB, indexes needed: `participants(wishlist_key)`, `priorities(wishlist_key)`, `votes(priority_id, user_id)` composite

### Referential integrity

**Foreign key equivalents:**
- A `priorities/{id}` entry has `addedBy: userId`. There is no FK constraint — if the user entry is deleted, `addedBy` becomes a dangling reference. Handled by `_cleanupStaleEntries()` which runs after each save.
- On participant delete (`DELETE_COLLAB_PARTICIPANT`), their votes and their priorities entries are **not** cascade-deleted. Votes remain in `priorities/{id}/votes/{userId}` but the user is no longer in participants. This is acceptable (vote still counts, user just left the session).

**App-level enforcement:**
- Max 3 listings selected: enforced in background.js `SELECT_LISTING` handler
- Max 5 priorities per user: enforced in every UI handler before push
- Listing selection is per-tab (enforced by `tabId` key in `tabState`)

### Transactions and consistency

**Race conditions that exist today:**

1. **Vote toggle** — `TOGGLE_VOTE` does two operations: check current vote state (implicit in message), then PUT or DELETE. Between read and write, another user could toggle. Firebase's REST API has no compare-and-swap. This can cause a "double-vote" if two users tap at exactly the same moment.
   - *Mitigation:* The votes map is idempotent per user (`userId: true`) — you can only vote once per user regardless. The real race is toggle-off: reading "I voted" then deleting while another request also deletes is harmless.

2. **`compareActive` state** — the in-memory `tabState` in the background service worker is single-threaded JS, so updates within one tab are serialized. No races here.

3. **No transactions** — Firebase REST API does not support multi-key transactions. The workaround is to write atomically to one path at a time. All writes in this extension are single-path operations (one PUT or DELETE).

**Isolation level equivalent:** Last-writer-wins on each Firebase path. No read-your-writes guarantee across paths.

### Schema evolution

**How the schema has changed:**
1. Started with `chrome.storage.sync` only for priorities (local-only)
2. Added Firebase for collaborative priorities (the `participants` subtree)
3. Added the `priorities` collection with vote maps (group nominations, separate from personal preferences)

**Migration strategy used:** Backward-compatible additions only. Old `storage.sync` data is still read on load (`GET_PRIORITIES` → `legacyRes`) and merged into the initial state. New Firebase data takes precedence.

**What would be different now:**
- The `participants/{userId}.priorities[]` and `priorities/{id}` collections overlap in purpose. A cleaner design would be a single `priorities` collection with user metadata, and the ranking logic would aggregate from there.
- User IDs generated with `Math.random()` have ~10^10 possible values — sufficient for the scale but not cryptographically secure. A proper UUID would be better.
- `updatedAt: Date.now()` (milliseconds integer) works but an ISO 8601 string would be more portable.

**Hypothetical relational schema (if this used PostgreSQL):**
```sql
-- Users: one row per browser identity
users (
  user_id   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name      TEXT         NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
)

-- Wishlists: one row per shared trip
wishlists (
  wishlist_key TEXT PRIMARY KEY  -- URL slug, e.g. "abc-123"
)

-- Participants: who has joined a wishlist
participants (
  wishlist_key TEXT NOT NULL REFERENCES wishlists(wishlist_key) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  updated_at   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (wishlist_key, user_id)
)
-- INDEX: participants(wishlist_key) — already covered by composite PK

-- Group-nominated priorities
priorities (
  priority_id  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  wishlist_key TEXT         NOT NULL REFERENCES wishlists(wishlist_key) ON DELETE CASCADE,
  text         TEXT         NOT NULL,
  added_by     UUID         REFERENCES users(user_id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ  DEFAULT now()
)
-- INDEX: priorities(wishlist_key)

-- Votes: M:N between users and priorities (replaces the votes map)
votes (
  priority_id UUID NOT NULL REFERENCES priorities(priority_id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  PRIMARY KEY (priority_id, user_id)   -- structural uniqueness, no double-vote
)
-- INDEX: votes(priority_id) for "count votes on a priority"
-- INDEX: votes(user_id) for "find all priorities a user voted on"

-- Personal preferences: what each user personally cares about
-- (replaces participants/{userId}.priorities[] denormalization)
personal_preferences (
  wishlist_key TEXT NOT NULL,
  user_id      UUID NOT NULL,
  priority_key TEXT NOT NULL,   -- amenity key or free text
  PRIMARY KEY (wishlist_key, user_id, priority_key),
  FOREIGN KEY (wishlist_key, user_id) REFERENCES participants(wishlist_key, user_id) ON DELETE CASCADE
)
```

Key differences from the Firebase model:
- `votes` is a proper join table (replaces the `votes: { userId: true }` map)
- `personal_preferences` is normalized instead of stored as an array on the participant row
- On parent delete, `ON DELETE CASCADE` handles cleanup automatically (no manual `_cleanupStaleEntries()`)
- `added_by` uses `ON DELETE SET NULL` so deleting a user doesn't orphan group priorities

---

## How to Make It More Robust

### 1. Amenity cache to avoid re-fetching on SPA navigation

Currently all amenities are re-fetched every time the user navigates to a different wishlist. A `sessionStorage` cache keyed by listing ID would avoid redundant fetches within a session.

### 2. Replace polling with Firebase SSE

The priorities panel polls every 15 seconds (`setInterval`). Firebase supports Server-Sent Events:
```
GET /wishlists/{key}/participants.json  with  Accept: text/event-stream
```
This gives real-time updates without the 15s lag and without spinning timers.

### 3. Add error boundary in content.js

Currently, any unhandled exception in `init()` can silently break the extension. Wrapping `scrapeAndSetup()` in a try-catch with a visible error badge would help debugging.

### 4. Add Firebase security rules

Current rules are open (`allow read, write: if true`). Minimum recommended rules:
```json
{
  "rules": {
    "wishlists": {
      "$wishlistKey": {
        "participants": {
          "$userId": {
            ".write": "auth == null || auth.uid == $userId"
          }
        }
      }
    }
  }
}
```
Or since there's no auth, at minimum rate-limit rules to prevent abuse.

---

## Quick Reference: Message Types

| Message | Direction | Purpose |
|---|---|---|
| `GET_STATE` | content → bg | Read current tab's compare state |
| `SELECT_LISTING` | content → bg | Add listing to selection (max 3) |
| `DESELECT_LISTING` | content → bg | Remove listing from selection |
| `SET_COMPARE_ACTIVE` | content → bg | Toggle compare panel state |
| `SWAP_LISTING` | content → bg | Replace a slot in the comparison panel |
| `PARSE_AMENITIES` | content → bg | Send fetched HTML for amenity parsing |
| `FETCH_AMENITIES` | content → bg | Legacy: bg fetches listing (no cookies) |
| `GET_PRIORITIES` | content → bg | Read local priorities from storage.sync |
| `SAVE_PRIORITIES` | content → bg | Write local priorities to storage.sync |
| `GET_USER_ID` | content → bg | Get or create stable user ID |
| `GET_COLLAB_PRIORITIES` | content → bg | Read all participants from Firebase |
| `GET_GROUP_DATA` | content → bg | Read participants + priorities from Firebase |
| `SAVE_COLLAB_PRIORITIES` | content → bg | Write this user's name+priorities to Firebase |
| `ADD_PRIORITY` | content → bg | Add group priority to Firebase |
| `TOGGLE_VOTE` | content → bg | Add/remove vote on a group priority |
| `DELETE_PRIORITY` | content → bg | Delete a group priority from Firebase |
| `DELETE_COLLAB_PARTICIPANT` | content → bg | Remove a participant entry from Firebase |
