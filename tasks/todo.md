# Compare / Quick Compare restructure

## Feature split (per user clarification across several messages)

1. **"Compare"** — renamed from the current standalone "Quick Compare" panel
   (`comparison-panel.js`, triggered by the pill button in `compare-button.js`).
   - Rename all visible UI text "Quick Comparison" / "Quick Compare" → "Compare".
   - No cap on number of selected listings (currently hard-capped at 3 in
     `content.js` lines 104, 135, 209 and mirrored, unused, in `background.js`
     line 68 — background.js's SELECT_LISTING/DESELECT_LISTING/GET_STATE are
     dead code, never called from content/ui, leave background.js alone).
   - Defaults to ALL wishlist listings selected when first opened (not empty,
     not top-3).
   - Always renders cards + shared amenity row-table (the `_buildAmenityTable`
     format), regardless of count — remove the `listings.length <= 3` branch
     that currently swaps in the per-card icon grid for this panel (that
     format moves to item 2 below instead).

2. **New embedded "Quick Compare"** — lives inside the sharing/Priorities
   panel (`priorities-panel.js`), positioned AFTER the voting/rankings
   section (`#airbnb-pp-top3` inside `.airbnb-pp-right`, built by
   `_buildRankingsHTML`).
   - Shows the top 3 listings (reuse the same scoring already computed for
     the rankings section, or pull the same ranked array).
   - Card format: photo + dropdown to swap which listing fills a slot +
     price + stats + per-card amenity icon grid (`_buildIconGrid`,
     `.airbnb-cp-icon-card` CSS — already restored in `comparison-panel.js`
     and `content.css` this session, can be reused/shared rather than
     duplicated).
   - Capped at 3 (independent of the uncapped "Compare" panel above).

3. **Compare button visibility bug**: opening "Share with people" (Priorities
   panel) must not hide/cover the Compare pill button
   (`#airbnb-compare-btn-wrapper`, injected via
   `headerRow.insertAdjacentElement('afterend', wrapper)` in
   `compare-button.js`). Investigate DOM insertion order / z-index /
   overlap between `.airbnb-pp-panel` and the button wrapper in
   `content.css`. No code currently calls `CompareButton.remove()` or hides
   it from the priorities flow — likely a layout/CSS overlap, not a JS bug.

4. **Outstanding, unresolved**: check-icon (select button) still lands in the
   wrong position on the photo per the user — no screenshot provided yet,
   not addressed in this pass. Do not attempt blind fixes to
   `check-icon.js` in this task.

## File ownership for this pass
- `content` agent: `extension/content/content.js` only — remove the 3-cap on
  `state.selectedListings` for the Compare flow, default-select-all-listings
  when Compare is opened via `onCompareToggle`. Do NOT touch the check-icon
  3-cap tied to visual selection UI unless it's the same cap used for
  Compare (verify by reading the actual call sites before changing).
- `ui` agent: `extension/ui/comparison-panel.js`, `extension/ui/compare-button.js`,
  `extension/ui/priorities-panel.js`, `extension/content/content.css`.

## Verification
No automated test suite. Both agents must trace their code changes by hand
(read the modified functions end-to-end) since browser verification isn't
available in this environment; note explicitly that a human needs to
load-unpacked and click through before this is considered done.
