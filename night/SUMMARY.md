# Night shift summary — 14→15 Nov 2026 (web/, branch `web/night-ui`)

Seven unattended runs, 03:08 → 09:25 UTC, about 180 commits on `web/night-ui`. Every run kept `cd web && npm run build` passing; nothing was pushed to `main`. Details per run: `night/LOG.md`; every task with a one-line "what changed": `night/TASKS.md` (145+ ticked, **0 open**).

**To ship it:** open a PR `web/night-ui` → `main`, review, merge, then redeploy the website (steps in `infra/deploy/README.md`). Two files outside `web/` need a human look on merge: `web/CLAUDE.md` (MapView row and file table updated) and the root `CLAUDE.md` status line "Website panel: to do" for the forecast, which should be ticked (left untouched: outside `web/`).

## What was done tonight

### Mike's PRIORITY block (all done, 03:41 run)
- **Landing:** copy rewritten in plain language; flat satellite timeline with badges (S-NPP "Ended"); "How it works" pictures redrawn from the real tool; "Source code" button with a GitHub mark; smooth scroll for the top nav (respects reduced motion); CTA hover/press; flat CTA card. No gradients (kit overridden in `landing.css` only).
- **Tool, first screen:** one plain status line (▲/▼ % vs a typical month, top-3 rank pill, context bullets, smoke note); "How reliable is this?" renamed "Brazil Fire Calendar can make mistakes".
- **Calendar redesign:** GitHub-style brick calendar (rows = years, bricks = months; filled = happened, dotted = typical, hatched = provisional), hover tooltip + popover card anchored to the brick, newest 3 years + Show more / Show less, one year forward as "typical" bricks (history, not a forecast), grid ready for weekly bricks (`--n`, `data-period`).
- **Polish:** flat surfaces, strict type scale and spacing tokens, data-feel transitions, close animations.

### New feature
- **README feature 18 — next-week fire chance** (`POST /api/forecast`, 06:55 run): ForecastPanel on the sheet, always with its label "Model estimate (experimental), not an official fire warning."; loading / starting-up / error / pre-2018 / demo-replay states; Copy as text; its 5 km cells on the map (viridis, legend, "showing 300 of 7,774"); hero link "Next week: model estimate ↓"; data sources + landing FAQ mention it.

### Audits (04:55, 05:55, 07:55, 08:55 runs) — about 70 fixes
- **Responsive:** checked 320 / 375 / 390 / 820 / 1024 / 1366×768 / 1440×900; no page overflow anywhere at 320; landing sections one screen tall at 1440×900 and 1366×768.
- **Accessibility:** axe-core clean on the landing (390 / 1440) and the tool (gate, sheet, detailed view, table, month card, drawing; 320 / 375 / 820 / 1440). Heatmap has a Table view; the quick calendar is one Tab stop with arrow keys inside; reduced motion respected (CSS, charts, scrolling); labels match visible names; focus traps in the landing menu and dialogs.
- **States:** loading skeletons, API error with Try again, zero fires, truncated hotspots, provisional / uncertain / partial cells, unfinished month/year as hollow chart points, map imagery failure (Natural Earth outline fallback, display only).
- **Last run (08:55):** Key numbers fill the desktop grid; chart PNG buttons stay beside their headings; month card rank line kept whole; landing method panels line up; "Other day" starts on the day the page shows; one Tab stop for the quick calendar; reduced motion in charts + phone jumps; drawing banner has a Cancel button and touch wording (no "Esc" on phones, wraps at 320); calendar and chart tooltips stay inside the screen / their cards; "Tap" on touch screens in the detailed subtitle.

## What is left open

- **Blocked (team decision):** state selector for the 27 states with real borders. Rule 1 (FIRMS data only, no IBGE) forbids it; presets stay plain boxes.
- **Needs the API (see "For Paul" below):** fire season per area, "N of M years above average", weekly bricks.
- **Not checked live:** every check ran on the mocks (the real API host was not reachable from the night runs). After merging, look once at the tool on the real API (`VITE_API_BASE_URL=https://fire-api.37-187-37-74.sslip.io`), especially `/api/status` coverage (S-NPP "ended 2 Nov 2026") and the forecast panel.
- **Not seen with imagery:** NASA GIBS tiles could not load from the night runs, so the map was checked with the outline fallback only.

## Questions for Mike (from `night/QUESTIONS.md`)

1. Detailed heatmap: the visible "Table" toggle is the keyboard / screen-reader path. Keep it?
2. Landing method section is two screens tall on tablets (640–1023px, `--h: 2`), by design. OK?
3. The reference pages (details.so, scrolltide, a1.gallery, refero) could not be opened unattended; CTA hover/press and the folder cards follow the described pattern. Please glance at them.
4. Method panels and the idea frame: the kit's painted grounds were made flat (no-gradients rule). OK?
5. Bricks are ~20px on a 375px phone (under 44px tap targets), taps still open the card. Keep the look, or bigger bricks + horizontal scroll?
6. The "Typical" row and the "2027 typical" row were merged into one row labelled "2027 · typical". OK, or a plain "Typical" row?
7. The landing closing band is pastel blue (#dfe7f1) instead of the kit's painted blue. Easy to revert (last rule in `landing.css`).
8. Map shows the Natural Earth outlines when GIBS imagery fails (display only). OK? (also Paul)
9. On phones, "Show my fire calendar" is pinned to the bottom after a point is picked. Keep?
10. Team list says Infrastructure does "daily updates", but the daily FIRMS job is not done yet. Change to "updates" if it does not ship.
11. Forecast panel placement (after the coming months, before the briefing) OK?
12. Forecast map colour breaks (0–10 / 10–25 / 25–50 / 50%+) are a display choice. OK, or should science/ give them?
13. Hero link "Next week: model estimate ↓": keep it?
14. The map now moves by itself: zooms to the next-week cells, and on desktop re-fits beside the month card. OK, or keep the whole-area view?

## For Paul (infra/)

- **`/api/status` coverage:** keep `to` = `2026-11-02` for `viirs_snpp`; the satellite cards, month card and data sources read "ended 2 Nov 2026" from it.
- **Fire season per area** (first screen: "is this the usual season, when does it end?"): add to `/api/analysis` `season: { start_month, peak_month, end_month, rule } | null`. Today the UI shows only `cards.peak_month`.
- **Years above average for this month** ("7 of the last 20 Novembers were above average"): `cards.years_above_avg: int | null`, `cards.years_compared: int | null`. Not computed in the browser.
- **Weekly values for the brick calendar:** optional request field `"period": "month" | "week"` on `POST /api/analysis`; with `"week"` return `calendar_weekly: [{ year, week (ISO 1–53), start, end, count, vs_avg_pct, provisional, uncertain, partial, days_covered }]` and `average_by_week: [{ week, mean, median, p10, p90 }]`, same rules as the monthly fields. Needs contract v0.3 + new mocks (`infra/tools/make_mocks.py`). The UI then sets `--n` to 53 and `data-period="week"` in `FireCalendar.tsx`.
- **Typical fire duration** (asked by Mike): would need per-fire tracking; probably out of scope, flagged only.
- **Merge note:** the root `CLAUDE.md` status line for the forecast website panel can be ticked once `web/night-ui` is merged.
