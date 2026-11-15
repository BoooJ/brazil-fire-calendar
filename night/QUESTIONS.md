# Night shift questions

- 2026-11-15: The detailed view's heatmap (ECharts canvas) cannot be reached by keyboard or screen reader cell by cell. The quick view is fully accessible, so I left it. Is it acceptable to point keyboard users to the quick view, or should the heatmap get a hidden table / arrow-key navigation? → 04:08 run: added a visible "Table" toggle in the detailed view (keyboard + screen reader path). Mike: keep it?
- 2026-11-15: The method section on tablets (640–1023px) is deliberately two screens tall (`--h: 2` in landing.css). TASKS asked for "every section fits one screen"; I kept it as designed. OK?

- 2026-11-15 (03:50 run): The reference pages (details.so, scrolltide, a1.gallery, refero) could not be fetched unattended (permission prompt timed out). The CTA hover/press and folder cards are adapted from the described pattern, not studied from the pages. Mike: please glance at them.
- 2026-11-15: The method panels and the idea frame still use the kit's painted / grain-gradient grounds (data-fx). The CTA and the timeline are flat now; should the three method panels go flat too (the "no gradients" rule says yes)? Added as a task.
- 2026-11-15: The new brick calendar on a 375px phone has ~20px bricks (12 per row, GitHub style), under the 44px tap-target rule. Taps still work and open the month card; OK for the look Mike asked for, or should phones get bigger bricks with horizontal scroll?
- 2026-11-15 (04:55 run): The calendar drew the same averages twice ("Typical" row + "2027 typical" row). I merged them: while the API has no months after the reference year, the average row is labelled "2027 · typical" (total "avg") with the not-a-forecast note under it. Mike: OK, or would you rather keep a plain "Typical" row and drop the 2027 label?
- 2026-11-15 (04:55 run): The landing's closing band used the kit's mid-blue "painting" ground; I overrode it to a pastel blue (#dfe7f1) to match the flat light palette. Easy to revert in landing.css (last rule).

- 2026-11-15 (05:55 run): When the NASA GIBS imagery cannot load, the map now draws the globe's Natural Earth outlines (display only, never for numbers) so drawing an area is not blind. Credited in web/CLAUDE.md and the data sources dialog. Mike/Paul: OK to show the outlines on the map in that case?
- 2026-11-15 (05:55 run): On phones, once a point is picked, "Show my fire calendar" is pinned to the bottom of the screen until its place in the steps is reached. Mike: keep it?
- 2026-11-15 (05:55 run): The landing's Team list says Infrastructure does "daily updates", but root CLAUDE.md lists the daily FIRMS update as not done yet. Left as is (it describes the role); change to "updates" if the daily job does not ship.

- 2026-11-15 (06:55 run): Built the next-week fire chance panel (README feature 18) on the sheet under "coming months", plus its cells on the map. Root `CLAUDE.md` status still says "Website panel: to do (web/)": I did not edit the root file (outside web/); please tick it when this branch is merged. Mike: placement OK (after the history cards, before the briefing)?
- 2026-11-15 (06:55 run): The forecast map shows the top `limit` cells (API default 2,000; mock 300) as dots about one 5 km cell wide, coloured with viridis (0–10 / 10–25 / 25–50 / 50%+). The class breaks are a display choice, not from the science team: OK, or should science/ give the breaks?
- 2026-11-15 (06:55 run): Added a small "Next week: model estimate ↓" link at the end of the hero's "not a forecast" bullet, so the forecast panel is findable from the first screen. Mike: keep it, or is the hero better without it?

- 2026-11-15 (07:55 run): The map now moves by itself in two new cases: it zooms to the next-week cells when they are shown, and on desktop it re-fits the area beside the month card when a month's hotspots arrive. Mike: OK, or should the map keep the whole-area view and let people zoom?
- 2026-11-15 (07:55 run): Under the satellite names the tool now says "ended 2 Nov 2026" (S-NPP) or "from 20 Jan 2012", read from `/api/status` coverage. Paul: the real `/api/status` must keep `to` = 2026-11-02 for `viirs_snpp` for this to show.

## For Paul (infra/)

- **Fire season per area** (for the first screen: "is this the usual fire season, when does it usually end?"): please add to `/api/analysis` something like `season: { start_month: int, peak_month: int, end_month: int, rule: "months whose mean is ≥ X% of the yearly total" } | null`. Today the UI only shows `cards.peak_month`.
- **How many of the earlier years were above average for this month** (e.g. "7 of the last 20 Novembers were above average"): `cards.years_above_avg: int | null` and `cards.years_compared: int | null`. Not computed in the browser.
- **Typical fire duration** (asked by Mike): not available; would need a per-fire tracking product. Probably out of scope, flagging only.
- **Weekly values for the brick calendar** (Mike wants GitHub-style weekly bricks): please add to `POST /api/analysis` an optional request field `"period": "month" | "week"` (default `"month"`). With `"week"`, return `calendar_weekly: [{ year, week (ISO 8601 week 1–53), start: "YYYY-MM-DD", end: "YYYY-MM-DD", count, vs_avg_pct, provisional, uncertain, partial, days_covered }]` and `average_by_week: [{ week, mean, median, p10, p90 }]`, same rules as the monthly fields (corrected fire-days, NOAA-20 equivalent, null never 0 for missing). The UI then sets `--n` to 53 and `data-period="week"` in FireCalendar.tsx. Contract bump to v0.3 + new mocks needed.
