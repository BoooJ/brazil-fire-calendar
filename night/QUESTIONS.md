# Night shift questions

- 2026-11-15: The detailed view's heatmap (ECharts canvas) cannot be reached by keyboard or screen reader cell by cell. The quick view is fully accessible, so I left it. Is it acceptable to point keyboard users to the quick view, or should the heatmap get a hidden table / arrow-key navigation? → 04:08 run: added a visible "Table" toggle in the detailed view (keyboard + screen reader path). Mike: keep it?
- 2026-11-15: The method section on tablets (640–1023px) is deliberately two screens tall (`--h: 2` in landing.css). TASKS asked for "every section fits one screen"; I kept it as designed. OK?

- 2026-11-15 (03:50 run): The reference pages (details.so, scrolltide, a1.gallery, refero) could not be fetched unattended (permission prompt timed out). The CTA hover/press and folder cards are adapted from the described pattern, not studied from the pages. Mike: please glance at them.
- 2026-11-15: The method panels and the idea frame still use the kit's painted / grain-gradient grounds (data-fx). The CTA and the timeline are flat now; should the three method panels go flat too (the "no gradients" rule says yes)? Added as a task.
- 2026-11-15: The new brick calendar on a 375px phone has ~20px bricks (12 per row, GitHub style), under the 44px tap-target rule. Taps still work and open the month card; OK for the look Mike asked for, or should phones get bigger bricks with horizontal scroll?

## For Paul (infra/)

- **Fire season per area** (for the first screen: "is this the usual fire season, when does it usually end?"): please add to `/api/analysis` something like `season: { start_month: int, peak_month: int, end_month: int, rule: "months whose mean is ≥ X% of the yearly total" } | null`. Today the UI only shows `cards.peak_month`.
- **How many of the earlier years were above average for this month** (e.g. "7 of the last 20 Novembers were above average"): `cards.years_above_avg: int | null` and `cards.years_compared: int | null`. Not computed in the browser.
- **Typical fire duration** (asked by Mike): not available; would need a per-fire tracking product. Probably out of scope, flagging only.
- **Weekly values for the brick calendar** (Mike wants GitHub-style weekly bricks): please add to `POST /api/analysis` an optional request field `"period": "month" | "week"` (default `"month"`). With `"week"`, return `calendar_weekly: [{ year, week (ISO 8601 week 1–53), start: "YYYY-MM-DD", end: "YYYY-MM-DD", count, vs_avg_pct, provisional, uncertain, partial, days_covered }]` and `average_by_week: [{ week, mean, median, p10, p90 }]`, same rules as the monthly fields (corrected fire-days, NOAA-20 equivalent, null never 0 for missing). The UI then sets `--n` to 53 and `data-period="week"` in FireCalendar.tsx. Contract bump to v0.3 + new mocks needed.
