# Night tasks (UI/UX, web/)

## PRIORITY — from Mike (UI/UX owner). Do these first, in this order.

Global rules for this block:
- **No gradients anywhere** (backgrounds, text, buttons, borders, charts chrome). Flat, calm pastel/neutral colours only. Data colour scales stay as `web/CLAUDE.md` requires (they are scales, not decoration). Kit files can't be edited: override in `src/landing/landing.css`.
- Visual references (WebFetch them, study, adapt to our palette — never copy brand assets, logos or text):
  - Light theme, spacing, type, colour: https://www.a1.gallery/website/poolside
  - Apple restraint (colour, spacing, minimalism; NOT the iPhone motion): https://styles.refero.design/style/a73148b9-449b-42cd-9f38-86ef694f500e
  - Start/CTA button interaction: https://www.details.so/inspo/antimetal-6c671b
  - Interactive data feel: https://www.scrolltide.co/#c-helio
  - Image + text cards ("folder" cards): https://www.scrolltide.co/components#c-card-folder
- Honesty rules still apply: only FIRMS data, display API values (never compute them in the browser), history is "not a forecast", the only forecast is `/api/forecast` with its label. Anything that needs new API data → write the exact request in `night/QUESTIONS.md` under "For Paul (infra/)" and build the UI so it can use it later.

### Landing page (#/)

- [x] **Rewrite the landing copy.** Current lines read robotic ("The fire record should not jump because of it.", "More fire, not more satellites", "read one clear message"). Rewrite every headline and paragraph so each section answers what the challenge asks: one harmonized MODIS + VIIRS record → a burning calendar for an area of interest, so early-warning services, scientists and land managers see historical patterns, unusual conditions and critical periods (wildfires and agricultural burning). Tone: plain, confident, human, short; benefit first, method second. Keep every fact true (S-NPP end date, NOAA-20 as the reference scale, fire-days on a 1 km grid, provisional months). Example of the direction, not final copy: "Satellites change. Your fire history doesn't." Keep the demo label "Demo data"; avoid the kit's red-flagged words.
  - New headlines and paragraphs in Landing.tsx (hero, idea "Satellites change. Your fire history doesn’t.", statement, steps, CTA, motivation for early-warning services/scientists/land managers, method, close). Sections fit as before at 4 sizes.
- [x] **Redesign the satellite comparison block** next to that copy (colours, layout, legibility): flat colours from our palette, clear labels, no gradients, readable at a glance. Same for the other small "signs"/badges on the landing page.
  - Timeline now sits on a flat light card (no painted ground), thin pastel pill bars, bolder labels, "Ended" (S-NPP) and "Reference scale" (NOAA-20) badges. Demo chip, step numbers, hot KPI and mini-map lost their dashes/gradients for flat fills.
- [x] **"How it works" images must match the real product.** Replace/redraw the step visuals so they show the tool as it really looks now (location step, the answer, the calendar). No invented UI. Use the image + text card pattern from the scrolltide folder-card reference.
  - #how is now three folder cards (tabbed light card with the screen drawn in HTML, then number + words): the location step, the one message (same `headlineFor()` as the tool, moved to format.ts) and the quick-view calendar (same level rule and colours). Old painted window removed. **When the calendar/first screen are redesigned, update `HowAnswer`/`HowCalendar` in landing/visuals.tsx too.**
- [x] **Source code button:** label "Source code" with a small GitHub mark icon (inline SVG, monochrome, sized to the text).
  - Method button and footer link now read "Source code" with an inline monochrome GitHub mark (1.05em, currentColor).
- [x] **Smooth scroll** for the top nav (The idea, How it works, Method, Questions, Team): gentle scroll instead of a jump; respect `prefers-reduced-motion`; keep the hash in the URL working.
  - `html:root { scroll-behavior: smooth }` under prefers-reduced-motion: no-preference (beats the kit's `auto`); a deep link (#method) on load still jumps instantly. Hash stays in the URL.
- [x] **Start/CTA button**: interactive hover/press behaviour adapted from the antimetal reference, in our palette.
  - Every primary button: hairline top highlight, 1px lift + soft halo ring in its own colour on hover, firm 0.97 press; arrow slides on the CTA. CTA card is now flat pastel peach with a dark button (grain/gradient ground removed). Reduced motion: no movement.

### The tool (#/app) — first screen

- [x] **Rework what the first screen says.** Users don't understand "separate fires", "fire-days so far", "1 of 24 rank among Novembers". New hierarchy:
  - Hero: ▲/▼/● + "Fire activity here is 31% above a typical November" (`headlineFor`/`trendOf`/`rankLine` in format.ts, calm --up/--down tokens), a rank pill only for the top 3 ("One of the three most active Novembers in 24 years"), then 3 context bullets (usual peak month from `cards.peak_month`, what it is compared with + "not a forecast", smoke note). The stats box (fire-days / separate fires / rank) is gone from the first screen; those stay in Detailed → Key numbers, where "Fire-days" now has a one-line explanation. Calendar now comes before "coming months". Missing API values → QUESTIONS.md (For Paul).
  1. **One big status line: is this unusual for my area right now?** Built from API values only (`briefing`, `vs_avg_pct`, `rank`, `of_years`), e.g. "Fire activity here is 25% above a typical November" or "One of the most active Novembers in 24 years". Calm colour + ▲/▼, no alarmism, and it is history, not a forecast (if showing the `/api/forecast` chance, it carries its label).
  2. **Short practical context** under it: is this the usual fire season here, when does the season usually peak/end (from the API's monthly averages shown as-is), how intense this month is compared with the typical one. One friendly general note is allowed, e.g. "Smoke from fires can lower air quality nearby", but **no air-quality numbers** (we don't have that data).
  3. Then the calendar.
  Remove or hide jargon ("fire-days", "separate fires", raw rank wording) from the first screen; move technical terms to the Detailed view with a one-line explanation. If a value we'd want isn't in the API (e.g. "how many of the last 20 Novembers were above average", "typical fire duration"), don't compute it: add it to QUESTIONS.md for Paul.
- [x] **Rename "How reliable is this?" → "Brazil Fire Calendar can make mistakes"** (both places: `components/Panels.tsx`, `pages/Tool.tsx`). Keep the content and the one-click access.
  - Both headings renamed; content and placement unchanged.

### The calendar — redesign (GitHub-contributions style)

- [x] **New calendar look.** Goal: appealing, intuitive, readable (think Flo / the GitHub contribution graph). Years as rows labelled on the left (2026, 2025, …); each period is a small **rounded square brick**, not a circle. Colour alone shows intensity (keep the colour-blind-safe scale + a compact legend with values). Remove the word "fire-days" from the calendar UI.
  - FireCalendar: one row per year at every width (label · 12 rounded bricks · total), month initials on phones, no numbers inside bricks (colour + tooltip), lively hover/focus ring, compact legend ("How much burned in the month" + values), "fire-days" removed from calendar text/tooltip/aria (tooltip leads with ▲/▼ % vs average). Tokens --r-brick, --brick-0. Detailed view heatmap unchanged.
- [x] **Interaction:** hover = lively, responsive highlight + small tooltip; click = a small popover card anchored to the brick with the real data for that period (did fire happen, how it compares with typical, provisional/partial status, link to open it on the map). Keyboard accessible.
  - Hover/focus: brick grows with a dark ring + tooltip. Click/Enter: a small card anchored to the brick (fire detected or not, corrected count, ▲/▼ % vs average + typical, provisional/partial/uncertain/final) with "Details and map" (opens the month card, which has the map button) and "Close". Focus moves in, Escape/outside click closes, focus returns to the brick. Legend minis are square.
- [x] **Show only the last 2–3 years by default** with "Show more years" / "Show less" toggles.
  - Quick view shows the newest 3 years; "Show more years (10 more)" adds ten at a time, "Show less" goes back to 3, with "3 of 24 years" beside them.
- [x] **Add one year forward** (rest of 2026 + 2027) as "typical" bricks (dotted/outlined) using the API's typical/average values, clearly labelled with `next_months_label` ("not a forecast").
  - A dotted "2027 · typical" row above the newest year, from `average_by_month` as-is, plus a note with `next_months_label`. The rest of 2026 was already dotted typical bricks. Hidden if the API ever returns months after the reference year.
- [x] **Weekly bricks:** the API currently gives **monthly** values only (`docs/api-contract.md`), and we must not compute weeks from hotspots in the browser. Build the brick component so it works with months now and can switch to weeks (52/53 per year row) when the API provides weekly values. Write the exact weekly endpoint/field request for Paul in QUESTIONS.md.
  - Brick grid is driven by `--n` (bricks per year) and `data-period` on .cal-grid; gaps and radii scale for 52/53 weeks. Still months, since the API is monthly. Exact weekly request for Paul in QUESTIONS.md.

### Polish

- [x] **Light theme in the spirit of the poolside + Apple references**: generous spacing, a strict type scale, hand-picked flat colours, consistent radii. Go through every part of the UI (controls, panels, popovers, legends, empty/error states), not only the hero. Update tokens in `src/styles.css` rather than one-off values.
  - [x] Sub-task 1: flat surfaces in the tool: error note, Key numbers hot card and skeletons (pulse instead of a shimmer gradient) are flat; dead `.stats` rules removed. Kept on purpose: the globe edge fade (blends the canvas into the page), hatching (a state encoding) and the heatmap legend bar (a data scale).
  - [x] Sub-task 2: a strict type scale as tokens (--t-xs 11 · --t-sm 13 · --t-base 15 · --t-md 17 · --t-lg 22 · --t-xl 28) and replace the one-off font sizes in styles.css
    - Done: --t-2xs…--t-4xl (10 · 12 · 13 · 14 · 16 · 18 · 22 · 26 · 34 · 40) in :root; every px font size in styles.css now uses them (11→12, 12.5→13, 15→16, 20→22, 24→26). Only the 8px "SO FAR" micro-tag stays literal.
  - [x] Sub-task 3: spacing pass on the sheet (use --s-* between sections: calendar, coming months, briefing, satellites, reliability), consistent radii on cards/popovers/legend
    - Added --s-8 (40) / --s-9 (56). Every sheet part (calendar, coming months, briefing…) is now separated by one rhythm: 40px + hairline + 40px. Calendar head/legend/foot and upcoming head use --s-*; desktop sheet padding 40px; briefing heading gets room.
  - [x] Sub-task 4: empty/error/legend/popover states checked at 375 and 1440 after the above
    - Brick card, month card and legend checked at 375 (touch) and 1440: no overflow, card stays inside the screen. Error/empty states use the same tokens (not re-triggerable with the mocks).
- [x] **Interactive data feel** (scrolltide helio reference): subtle, fast transitions when switching area/date/view and when numbers change; respect `prefers-reduced-motion`.
  - New area or date: the headline, rank pill and context ease in (staggered 0/40/80 ms) and calendar rows rise in one after another; switching Counts ↔ vs Average glides the brick colours (0.25 s). All off under prefers-reduced-motion (existing global rule).

## Blocked — needs a team decision (do NOT do these at night)

- State selector for all 27 Brazilian states + real state borders instead of rectangles. Root `CLAUDE.md` rule 1 forbids outside border data (no IBGE), presets are plain boxes, and `web/CLAUDE.md` says outlines are display-only, never for selecting data. Needs Paul + team to decide.

## Earlier list

- [x] Tool (#/app) at 375px width: no horizontal scroll anywhere; controls, sheet and globe stack cleanly; tap targets ≥ 44px
  - Checked 375px (no overflow); phone media query makes seg/ghost/textlink/map buttons and brand link ≥ 44px.
- [x] Tool at 820px and 1366px: check spacing, alignment and that nothing overlaps the globe/map stage
  - 1366 fine. Tablet (600–899px): taller map band in map mode, compact map caption, month card centred (max 560px).
- [x] Landing page at 1440×900, 1366×768, 820×1180, 390×844: every section fits one screen, no clipped text
  - Measured all four sizes: no horizontal scroll, no clipped text. Method now fits one 1366×768 screen (smaller panels). Method on tablets stays two screens by design (--h: 2); tall phone sections grow as the kit intends.
- [x] Loading state: consistent skeletons/spinners for the sheet, the calendar and the detailed view (no layout jump when data arrives)
  - Hero skeleton now includes the stats box; the sheet skeleton mirrors the coming-months cards and calendar rows (SheetSkeleton in Tool.tsx).
- [x] Zero-fires state: a clear, friendly empty state in the calendar and map instead of an empty grid
  - Calendar: hollow dotted-circle art, friendlier text and a button back to the location step. Map: centred "No fires detected" note and caption "No hotspots in Mon YYYY".
- [x] API error state: one consistent error message component with a retry button
  - New components/ErrorNote.tsx (page + inline sizes, retry) used for the analysis error and the month's map error.
- [x] Truncated hotspots: visible "showing 300 of N" badge on the map, readable on mobile
  - Map caption now carries an orange "showing 300 of N" badge (fits at 375px); tooltip says the CSV has every hotspot.
- [x] Provisional / uncertain / partial cells: make the hatching/fading consistent between FireCalendar and BurningCalendar and explain it in the legend
  - Same wording in both legends (hatched / faded / month in progress), same 0.6 fade for uncertain cells, tooltip text aligned.
- [x] Legends: show values for every colour step; vs Average legend with ▲/▼ and a neutral middle
  - Heatmap vs-average ticks now read ▼ ¼× · ▼ ½× · ● avg · ▲ 2× · ▲ 4×+; quick legend middle step says "near average (±20%)". Count steps already had values.
- [x] Keyboard: every interactive element reachable with Tab, visible :focus-visible ring using a design token, Escape closes dialogs/popups
  - Focus ring uses --focus / --focus-sheet tokens. Month card: focus moves in on open, back to the cell on close, Escape closes it. (Detailed heatmap cells are canvas: the quick view is the keyboard path.)
- [x] ARIA: labels for icon-only buttons, the calendar grid cells announce month, year and count
  - Typical cells and year totals get role=img + labels, month initials hidden from screen readers, PNG/CSV/Clear/location buttons say what they do.
- [x] Contrast: check all text and UI against WCAG AA on both the white sheet and the dark panels; fix tokens, not single colours
  - Checked ~25 text pairs (all ≥ 4.5:1). Fixed non-text contrast with new tokens: --sheet-edge (typical/no-fire outlines, 3.1:1), --line-strong (input edges), --sheet-border.
- [x] Hover details on calendar cells: consistent tooltip style, works with keyboard focus too
  - Quick view cells get a styled tooltip (same look as the heatmap's) on mouse hover and keyboard focus; taps still open the month card. Native title removed.
- [x] Design tokens: replace hard-coded colours, radii, shadows and spacing in src/styles.css and components with the tokens at the top
  - [x] Sub-task 1: radius scale (--r-*), surfaces (--surface, --surface-2, --overlay, --sheet-soft) and shadows (--shadow-*) tokenised in styles.css
  - [x] Sub-task 2: remaining text colours (#ffd9c2, #ffd08a, #ece9e2…), chart panel colours shared with EChart.tsx, a spacing scale
    - Added --fire-ink, --warn-ink, --warn, --panel*, and a --s-1…--s-7 spacing scale (defined; new rules should use it, old paddings left as is to avoid visual drift).
- [x] Buttons: one consistent set of variants (primary, secondary, ghost) with hover, active, disabled and focus states
  - Documented the variants at the top of the buttons block; every variant now has hover, pressed and disabled states (no press animation when disabled); segmented buttons get a hover colour.
- [x] LocationGate ("Where should we look?"): clearer step layout, helpful hints, mobile-friendly inputs
  - Coordinate hint (tap the globe, south/west negative, example), outside-Brazil inputs flagged with aria-invalid + amber edge, dropped inputMode=decimal (iOS keypad had no minus sign), enterKeyHint/autoComplete set.
- [x] Micro-interactions: smooth transitions for view switch (quick ↔ detailed), calendar hover and panel open/close; respect prefers-reduced-motion
  - Calendar area fades/lifts in on quick ↔ detailed, cells lift with a soft shadow on hover, dialog backdrop fades in, chips ease. All switched off by the existing prefers-reduced-motion rule. (Close animations not added: would need delayed unmount.)
- [x] MonthDetail and Panels: tidy typography hierarchy (sizes, weights, line-height), numbers in tabular figures
  - Tabular figures on every number block (month card, key cards, stats, satellites, coming months, sources, tooltip); tightened label/note line-heights and heading spacing; month card eyebrow no longer runs under the close button.
- [x] Map popups: consistent styling with the rest of the tool, readable on mobile
  - Hotspot popup restyled like the calendar tooltip: date/time title, fire strength as the big number, satellite and pass, confidence, amber provisional flag; max 260px wide for phones.
- [x] Find and merge duplicated UI components or duplicated CSS rules
  - Merged the two .chip rules; the calendar tooltip and map popup share one tooltip rule (+ --panel-flag token). Error messages already merged into ErrorNote.tsx earlier tonight.

## Found on the 2026-11-15 night run (after the list above was done)

- [x] Hero stats: "rank among Novs" reads oddly; use the full month name ("rank among Novembers")
  - Tool.tsx Hero uses MONTHS instead of MON for that label.
- [x] Desktop globe: the left fade over light-grey Brazil shows as a visible grey band at ~60% width (1366px). Soften the gradient or start it on the dark ocean
  - Longer, eased fade (0 → 8% → 18% → 36%) on the desktop globe edge; the hard band is gone.
- [x] Month card and data sources dialog: add a close animation (needs a short delayed unmount)
  - New components/useClosing.ts: 160 ms sink/fade-out before unmount (instant with reduced motion). Month card focus now returns to its calendar brick even when opened from the brick card.
- [x] Detailed view heatmap is a canvas: cells are not reachable by keyboard (see night/QUESTIONS.md)
  - New "Table" toggle beside PNG/CSV swaps the canvas heatmap for a real table (caption, th scopes, each month a button with a full aria-label, * provisional). Enter opens the month card; focus comes back.
- [x] Gate on phones: the long single column could show the four ways as numbered steps (1 location · 2 region · 3 point · 4 draw)
  - Under 600px the four dividers carry numbered badges (CSS counter) and a "1 your location" divider appears above the location button; desktop unchanged.
- [x] Landing "How it works" cards follow tonight's tool changes
  - Step 2 now draws the new hero (▲ headline, rank pill when top 3, context bullets); step 3 draws rounded bricks.
- [x] Quick view: last "fire-days" wording outside the Detailed view
  - Coming-months cards say "on average (corrected count)", month card "corrected count", empty state "saw no fire". Detailed view keeps the term with its explanation.
- [x] Landing method panels: drop the kit's grain-gradient ground (no gradients rule)
  - Panels are flat #eef0f6 like the satellite timeline; the kit's radial shade removed; conversion arrow darkened.

## Found on the 04:06 run

- [x] Landing "Built for people…" app frame showed a list of years the tool doesn't have (invented UI)
  - Left pane is now the tool's white sheet with the brick calendar (10 years, the open month outlined); map pane keeps the real month stats; glow gradients on the mini-map removed.
- [x] Phone: the calendar legend takes ~150px before the first brick; fold the state keys (typical / provisional / uncertain / in progress) into a "What the marks mean" disclosure under 600px
  - Under 600px the four state keys sit in a "What the marks mean ▾" disclosure; the colour steps with values stay visible. Desktop unchanged.
- [x] web/CLAUDE.md file table: describe FireCalendar as bricks + anchored card, `headlineFor`/`trendOf`/`rankLine` in format.ts, `components/useClosing.ts`
  - Done (needs the usual quick human review of CLAUDE.md changes).
- [x] Calendar keyboard: arrow keys move between bricks (←/→ months, ↑/↓ years, skipping empty cells)
  - onKeyDown on .cal-grid; Tab still reaches every brick, Enter opens the brick card.
- [x] Landing CSS: remove the dead hero-window / year-list rules (HeroWindow and the year list are gone)
  - ~25 unused .bfc-win / .bfc-kpi / .bfc-yr rules deleted; the app frame stats keep their own rules.
- [x] Calendar fine print said "colour shows how much burned" in vs Average mode too
  - Now mode-dependent: vs Average explains orange above / purple below the average.

## Found on the 04:55 run

- [x] Calendar drew the same averages twice ("Typical" row and "2027 typical" row, identical bricks)
  - One row now: while the API has no months after the reference year it is labelled "2027 · typical" (the average row, total "avg"), with the note under it; otherwise it is the plain "Typical" row. web/CLAUDE.md's "average row" is still there.
- [x] Location step: the disabled "Show my fire calendar" button is dark brown with dark text (hard to read, looks broken); give it a calm disabled look and a hint of what is missing
  - Disabled main button is a flat dark surface with readable grey text and says "Tap the globe or type a point first"; it becomes the orange "Show my fire calendar" once a point exists.
- [x] Phone (375px): the three "coming months" cards are cramped (words wrap to 1–2 per line); stack them as rows under 600px
  - Under 600px each card is one row: month + words on the left, the number on the right. Desktop unchanged.
- [x] Desktop globe edge fade still shows vertical banding over the light Brazil fill at 1366×768; check and soften
  - Eight eased stops (to 42%) instead of four: the fade over Brazil's west no longer ends in a visible edge.
- [x] Landing "How it works" step 3 and the app frame: add the dotted next-year typical row, as the tool now shows it
  - HowCalendar draws a "2027" row of dotted bricks from `average_by_month` (as-is) and the rest of 2026 as dotted typical bricks, coloured by level like the tool.
- [x] Month card flags started with a stray "·"; brick card read "Fire was detected: corrected count 442"; Detailed view: "Burning calendar" sat right under the Key numbers cards
  - Flags get a small amber dot; brick card says "Fire detected" then "442 corrected count" (number first, bigger); Key numbers → calendar now uses the sheet's 40 + line + 40 rhythm.
- [x] Key numbers on phones/tablets: "Peak month" sat alone in a half-empty last row
  - In the two-column layout the last card spans the full width; desktop's three columns unchanged.
- [x] vs Average mode: typical (dotted) bricks kept their orange count colours, which read as "above average" in that legend
  - In vs Average the typical bricks and their legend key are neutral grey dotted (they are the average); Counts unchanged.
- [x] Landing "Real change, not sensor change" chart: the corrected marks were yellow, almost the same as the NOAA-20 amber bars
  - Corrected marks (and their key) are white with a thin dark edge; satellite colours unchanged.
