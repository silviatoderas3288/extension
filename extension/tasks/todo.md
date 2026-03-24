# NYC Jobs 3D Map Platform — Task Board

## How to Use
- Check off items as you complete them: `- [x]`
- Mark the active item with `→`
- Add blockers under a task with `  ⚠ blocker: ...`

---

## Phase 1 — Foundation
> Goal: Running monorepo, DB up, API serving seed data, basic map with pins.

- [ ] Set git remote to `https://github.com/silviatoderas3288/linked.git`
- [ ] Create `.gitignore` (root, client, server)
- [ ] Create `.env.example` (root, client, server)
- [ ] Create `docker-compose.yml` with PostGIS 15
- [ ] Write `server/db/migrations/001_create_companies.sql`
- [ ] Write `server/db/migrations/002_create_jobs.sql`
- [ ] Write `server/db/migrations/003_seed_data.sql` (80–100 NYC jobs, 6 industries)
- [ ] Bootstrap `server/` with Express + pg + cors + helmet + dotenv
- [ ] Implement `GET /api/health`
- [ ] Implement `GET /api/jobs/map-pins` (lightweight: id, lat, lng, title, domain)
- [ ] Implement `GET /api/jobs` (with industry + position_type + radius filters)
- [ ] Implement `GET /api/jobs/:id` (full detail with company)
- [ ] Bootstrap `client/` with Vite + React
- [ ] Install client deps: mapbox-gl, zustand, @tanstack/react-query, axios, tailwindcss, framer-motion
- [ ] Mount Mapbox GL JS, center on NYC `[-73.9857, 40.7484]`
- [ ] Render company logo pins using Clearbit URLs as Mapbox Markers
- [ ] Click pin opens basic `JobDetailPanel` (right slide-in)
- [ ] Initial commit + push to remote

**Deliverable**: Clickable map with company logo pins and job cards.

---

## Phase 2 — Filters + Job List
> Goal: Full filter functionality, job list sidebar, bidirectional map↔list sync.

- [ ] Wire Zustand store: `selectedJobId`, `filters`, `mapMode`
- [ ] Implement `FilterBar.jsx` — industry + position type selects
- [ ] Wire filters to API query params via React Query
- [ ] `Sidebar.jsx` — scrollable job list with `JobCard` components
- [ ] Hover `JobCard` → highlight corresponding map pin
- [ ] Click map pin → scroll to matching `JobCard`
- [ ] Construct Glassdoor links (`lib/glassdoor.js`)
- [ ] Salary range display with formatter
- [ ] `ModeToggle.jsx` — Map / Street View button

**Deliverable**: Full interactive 2D map with working filters and job list.

---

## Phase 3 — 3D Street View Mode
> Goal: WASD walkable avatar, 3D buildings, floating building signs.
> ⚠ Most complex phase — plan carefully before starting.

- [ ] Enable Mapbox 3D buildings layer (`fill-extrusion` on composite source)
- [ ] `AvatarController.jsx`:
  - WASD / arrow key listener
  - `requestAnimationFrame` loop
  - `freeCameraOptions` camera movement at street level (pitch 70–85°)
  - Mouse drag rotates bearing (yaw)
- [ ] `BuildingSign.jsx`:
  - Custom DOM Mapbox Marker per job in viewport
  - Semi-transparent card: company logo + job title
  - Click opens `JobDetailPanel`
  - Viewport-culled: only render if job is within map bounds
- [ ] `StreetViewOverlay.jsx` — crosshair HUD + movement hint
- [ ] Mode switch: standard (pitch=0, zoom=13) ↔ street view (pitch=75, zoom=18)
- [ ] Performance: `map.on('moveend')` re-culls visible signs

**Deliverable**: Walk NYC streets, see floating job signs, click to open detail.

---

## Phase 4 — Office Photos + Polish
> Goal: Office photos in detail panel, responsive design, animations.

- [ ] `GET /api/companies/:id/photos` — proxy Google Places Photos API
- [ ] Store `place_id` per company in seed data
- [ ] `OfficePhotos.jsx` — swipeable photo carousel
- [ ] Framer Motion slide-in animation for `JobDetailPanel` (300ms ease)
- [ ] Empty states: no jobs match filters, company has no photos
- [ ] Mobile responsive: sidebar collapses to bottom sheet at `md` breakpoint
- [ ] Error boundaries around Mapbox GL and API calls
- [ ] Loading skeletons for initial map load + panel transitions
- [ ] Favicon, page title, meta tags

**Deliverable**: Polished, production-quality MVP.

---

## Phase 5 — Data Pipeline + Deployment
> Goal: Real job data, deployed to production.

- [ ] Adzuna API sync service (`server/services/adzuna.js`)
- [ ] `POST /api/admin/sync` endpoint — protected by `ADMIN_SECRET` header
- [ ] Geocode addresses via Mapbox Geocoding API (fallback for missing coordinates)
- [ ] Deploy server + DB to Railway (PostGIS support confirmed)
- [ ] Deploy client to Vercel
- [ ] Set Mapbox token URL restrictions to production domain
- [ ] Set up GitHub Actions workflow for CI
- [ ] Health check monitoring on Railway

**Deliverable**: Live app at production URL with real NYC job data.

---

## Review / Notes
_(Add notes here after each phase completion)_
