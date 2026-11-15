// The fire calendar, GitHub-contributions style: one block per year, a brick per ISO week (53 columns wrapped onto
// two lines, three on phones, so the bricks stay big; week 53 stays empty in years without it). The weeks come from the API ("period": "week", contract v0.4): never built from hotspots
// here. If an answer has no weeks, the same grid falls back to one brick per month.
// Colour shows intensity (filled = happened, faded = coming, an estimate from the average, not a forecast; hatched = provisional,
// faded = uncertain). Pointing at a brick lifts it; a click (or resting the mouse on it for 5 s) opens a small card anchored to the brick, with
// its month on the map (the map, the cards and the charts stay monthly).
// The detailed view draws the same months as a dense heatmap with the numbers: see BurningCalendar.tsx.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Analysis, CalendarItem, WeekItem } from '../types';
import { MON, MONTHS, compact, num, pctLong, vsTypical } from '../format';
import { LEVEL_WORDS, levelWord, makeCountLevels, vsLevel } from '../levels';

export type Mode = 'counts' | 'vs';

const VS_LABELS = ['−50%', '−20%', 'typical', '+20%', '+100%'];
/** years shown before "See more" */
const FIRST = 4;

/** One brick: a week (from calendar_weekly) or a month (from calendar). Every number is the API's. */
interface Brick {
  key: string;
  /** the row: calendar year for months, ISO year for weeks */
  year: number;
  /** 0-based column: month − 1, or ISO week − 1 */
  col: number;
  count: number | null;
  vs_avg_pct: number | null;
  provisional: boolean;
  uncertain: boolean;
  partial: boolean;
  days_covered: number;
  /** "Week 46 · 9–15 Nov 2026" or "November 2026" */
  title: string;
  /** the month this brick opens on the map and in the month card (a week: the month of its Thursday, ISO style) */
  month: CalendarItem | undefined;
  week?: WeekItem;
}

// ---------- ISO week dates (labels only: which days a week number covers) ----------
const DAY = 86400000;
const utc = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
/** 53 weeks when 1 Jan is a Thursday, or a Wednesday in a leap year */
function isoWeeksIn(y: number) {
  const jan1 = new Date(Date.UTC(y, 0, 1)).getUTCDay();
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return jan1 === 4 || (leap && jan1 === 3) ? 53 : 52;
}
/** Monday of ISO week w of ISO year y (week 1 holds 4 January, so it can start in late December) */
function isoWeekStart(y: number, w: number) {
  const jan4 = new Date(Date.UTC(y, 0, 4));
  return new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * DAY + (w - 1) * 7 * DAY);
}
/** "9–15 Nov 2026", "27 Oct – 2 Nov 2026", "29 Dec 2025 – 4 Jan 2026" */
function dayRange(a: Date, b: Date) {
  const d = (x: Date) => x.getUTCDate();
  const m = (x: Date) => MON[x.getUTCMonth()];
  const y = (x: Date) => x.getUTCFullYear();
  if (y(a) !== y(b)) return `${d(a)} ${m(a)} ${y(a)} – ${d(b)} ${m(b)} ${y(b)}`;
  if (a.getUTCMonth() !== b.getUTCMonth()) return `${d(a)} ${m(a)} – ${d(b)} ${m(b)} ${y(b)}`;
  return `${d(a)}–${d(b)} ${m(b)} ${y(b)}`;
}
const weekTitle = (y: number, w: number) => {
  const a = isoWeekStart(y, w);
  return `Week ${w} · ${dayRange(a, new Date(a.getTime() + 6 * DAY))}`;
};
/** "−93%", "+12%" */
const signedPct = (p: number) => {
  const r = Math.round(p);
  return r === 0 ? '±0%' : `${r < 0 ? '−' : '+'}${Math.abs(r)}%`;
};
/** A year wraps onto several lines so the bricks stay big: [first, last] column of each line.
 *  Weeks: two halves (Jan–Jun, Jul–Dec), four quarters on phones. Months: one line. */
const LINES = {
  wide: [[0, 25], [26, 52]],
  narrow: [[0, 12], [13, 25], [26, 38], [39, 52]],
  month: [[0, 11]],
} as const;
const NARROW = '(max-width: 700px)';
function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches);
  useEffect(() => {
    const mq = window.matchMedia(NARROW);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

interface Props {
  data: Analysis;
  selected: CalendarItem | null;
  onSelect: (item: CalendarItem) => void;
  /** opens that month's hotspots on the map */
  onOpenMap: (item: CalendarItem) => void;
  /** a day to bring into view and light briefly ("Select a day"): its week, or its month; `n` changes on every request */
  jump?: { year: number; month: number; day?: string; n: number } | null;
  mode: Mode;
  onMode: (m: Mode) => void;
  onCsv: () => void;
}

export default function FireCalendar({ data, selected, onSelect, onOpenMap, jump, mode, onMode, onCsv }: Props) {
  const weekly = !!data.calendar_weekly?.length;
  const n = weekly ? 53 : 12;
  const unit = weekly ? 'week' : 'month';
  const narrow = useNarrow();
  const lines = weekly ? (narrow ? LINES.narrow : LINES.wide) : LINES.month;
  const per = Math.max(...lines.map(([a, b]) => b - a + 1));
  const period = data.average_period ? `${data.average_period.from}–${data.average_period.to}` : 'no complete year yet';

  // every brick, keyed "year-col"; a week opens the month that holds its Thursday
  const { bricks, years, byKey, nowKey } = useMemo(() => {
    const months = new Map(data.calendar.map((c) => [`${c.year}-${c.month}`, c]));
    const bricks: Brick[] = weekly
      ? data.calendar_weekly!.map((w) => {
          const thu = new Date(utc(w.start).getTime() + 3 * DAY);
          const s = utc(w.start);
          const month = months.get(`${thu.getUTCFullYear()}-${thu.getUTCMonth() + 1}`) ?? months.get(`${s.getUTCFullYear()}-${s.getUTCMonth() + 1}`);
          return { ...w, key: `${w.year}-${w.week - 1}`, col: w.week - 1, title: `Week ${w.week} · ${dayRange(utc(w.start), utc(w.end))}`, month, week: w };
        })
      : data.calendar.map((c) => ({ ...c, key: `${c.year}-${c.month - 1}`, col: c.month - 1, title: `${MONTHS[c.month - 1]} ${c.year}`, month: c }));
    const byKey = new Map(bricks.map((b) => [b.key, b]));
    const ref = data.query.ref_date;
    const now = weekly
      ? bricks.find((b) => b.week!.start <= ref && ref <= b.week!.end)
      : byKey.get(`${data.cards.ref_year}-${data.cards.ref_month - 1}`);
    return { bricks, years: [...new Set(bricks.map((b) => b.year))].sort((a, b) => b - a), byKey, nowKey: now?.key ?? null };
  }, [data, weekly]);

  const levels = useMemo(() => makeCountLevels(bricks), [bricks]);
  // typical bricks: coloured by size in Counts; in vs Average they ARE the average, so they stay neutral
  const typLv = (mean: number | null | undefined) => (mode === 'counts' ? levels.level(mean ?? null) : 0);
  const avg = useMemo(
    () => new Map<number, number | null>(weekly ? (data.average_by_week ?? []).map((a) => [a.week - 1, a.mean]) : data.average_by_month.map((a) => [a.month - 1, a.mean])),
    [data.average_by_week, data.average_by_month, weekly],
  );
  // the row the reference day is in, and the last column that has data in it (later columns: what is typical)
  const nowBrick = nowKey ? byKey.get(nowKey) : undefined;
  const refYear = nowBrick?.year ?? data.cards.ref_year;
  const refCol = nowBrick?.col ?? data.cards.ref_month - 1;
  const colsIn = (y: number) => (weekly ? isoWeeksIn(y) : 12);
  const typLabel = (y: number, col: number) => (weekly ? weekTitle(y, col + 1) : `${MONTHS[col]} ${y}`);

  // one tooltip for hover and keyboard focus, styled like the detailed view's chart tooltip
  const [tip, setTip] = useState<{ item: Brick | null; typ?: { label: string; mean: number | null }; el: HTMLElement; x: number; y: number } | null>(null);
  const place = (item: Brick, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setTip({ item, el, x: r.left + r.width / 2, y: r.top });
  };
  const showTyp = (el: HTMLElement, label: string, mean: number | null | undefined) => {
    const r = el.getBoundingClientRect();
    setTip({ item: null, typ: { label, mean: mean ?? null }, el, x: r.left + r.width / 2, y: r.top });
  };
  // Pointing at a brick only lifts it (CSS). Its info opens on a click, or after resting the mouse on it for 5 s.
  const DWELL_MS = 5000;
  const dwell = useRef<number | undefined>(undefined);
  const stopDwell = () => window.clearTimeout(dwell.current);
  useEffect(() => stopDwell, []);
  const onRest = (open: (el: HTMLElement) => void) => (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse') return;
    const el = e.currentTarget;
    stopDwell();
    dwell.current = window.setTimeout(() => open(el), DWELL_MS);
  };
  // keyboard focus shows the short info at once (a keyboard has no hover)
  const onFocusTip = (item: Brick) => (e: React.FocusEvent<HTMLElement>) => e.currentTarget.matches(':focus-visible') && place(item, e.currentTarget);
  const hideTip = () => setTip(null);
  useEffect(() => {
    if (!tip) return;
    const follow = () => {
      const r = tip.el.getBoundingClientRect();
      setTip({ ...tip, x: r.left + r.width / 2, y: r.top });
    };
    // capture: also the calendar's own sideways scroll on phones
    window.addEventListener('scroll', follow, { passive: true, capture: true });
    return () => window.removeEventListener('scroll', follow, { capture: true });
  }, [tip]);

  // click / Enter on a brick: a small card anchored to it, with its numbers (all from the API)
  const [pop, setPop] = useState<{ item: Brick; el: HTMLElement; focus?: boolean } | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [popPos, setPopPos] = useState<{ left: number; top: number; below: boolean } | null>(null);
  useEffect(() => {
    if (!pop) return;
    const placePop = () => {
      const r = pop.el.getBoundingClientRect();
      const below = r.bottom + 250 < window.innerHeight;
      setPopPos({ left: Math.min(Math.max(r.left + r.width / 2, 158), window.innerWidth - 158), top: below ? r.bottom + 10 : r.top - 10, below });
    };
    placePop();
    const close = (back: boolean) => {
      setPop(null);
      if (back && document.contains(pop.el)) pop.el.focus({ preventScroll: true });
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close(true);
    const onDown = (e: PointerEvent) => {
      if (!popRef.current?.contains(e.target as Node) && e.target !== pop.el) close(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('scroll', placePop, { passive: true, capture: true });
    window.addEventListener('resize', placePop);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('scroll', placePop, { capture: true });
      window.removeEventListener('resize', placePop);
    };
  }, [pop]);

  // arrow keys, as in a data grid: left/right = the previous/next week (or month) of that year, across its lines;
  // up/down = the line above/below, so a wrapped year reads top to bottom and then goes on to the next year
  const moveFocus = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const from = e.target as HTMLElement;
    if (!from.matches('button.day')) return;
    const go = (btn: HTMLElement | null | undefined) => {
      if (!btn) return false;
      e.preventDefault();
      btn.focus();
      btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      return true;
    };
    const cellOf = (el: HTMLElement) => el.closest<HTMLElement>('.cell')!;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const cells = [...from.closest('.yr')!.querySelectorAll<HTMLElement>('.yr-line > .cell')];
      const step = e.key === 'ArrowLeft' ? -1 : 1;
      for (let i = cells.indexOf(cellOf(from)) + step; i >= 0 && i < cells.length; i += step) if (go(cells[i].querySelector<HTMLElement>('button.day'))) return;
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const rows = [...e.currentTarget.querySelectorAll<HTMLElement>('.yr-line')].filter((r) => r.querySelector('button.day'));
      const r = rows.findIndex((row) => row.contains(from));
      const c = [...rows[r].children].indexOf(cellOf(from));
      const step = e.key === 'ArrowUp' ? -1 : 1;
      for (let rr = r + step; rr >= 0 && rr < rows.length; rr += step) {
        const cells = rows[rr].children;
        if (go(cells[Math.min(c, cells.length - 1)]?.querySelector<HTMLElement>('button.day'))) return;
      }
    }
  };

  const popShown = !!(pop && popPos);
  useEffect(() => {
    // opened by a click or Enter: focus moves into the card; opened by resting the mouse: focus stays put
    if (popShown && pop?.focus) popRef.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  }, [popShown, pop]);

  // the newest three years first; more on request (all the rows stay in the API answer and the CSV)
  const [shown, setShown] = useState(FIRST);
  const visibleYears = years.slice(0, shown);
  const gridRef = useRef<HTMLDivElement>(null);
  // "Select a day": show that year if it is folded away, scroll to its week (or month), light it for a moment
  const [flashKey, setFlashKey] = useState<string | null>(null);
  useEffect(() => {
    if (!jump) return;
    const day = jump.day ?? `${jump.year}-${String(jump.month).padStart(2, '0')}-01`;
    const b = weekly ? bricks.find((x) => x.week!.start <= day && day <= x.week!.end) : byKey.get(`${jump.year}-${jump.month - 1}`);
    if (!b) return;
    const at = years.indexOf(b.year);
    if (at < 0) return;
    if (at >= shown) setShown(at + 1);
    setFlashKey(b.key);
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const go = requestAnimationFrame(() => requestAnimationFrame(() =>
      gridRef.current?.querySelector(`[data-key="${b.key}"]`)?.scrollIntoView({ block: 'center', inline: 'center', behavior: still ? 'auto' : 'smooth' })));
    const off = window.setTimeout(() => setFlashKey(null), 2600);
    return () => { cancelAnimationFrame(go); window.clearTimeout(off); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump?.n]);

  // One Tab stop for the whole grid (roving tabindex): the brick last focused, else this week/month, else the newest.
  // The arrow keys (moveFocus) move between bricks, so Tab goes on to the next control instead of every brick.
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const stopKey = useMemo(() => {
    const keys = visibleYears.flatMap((y) => Array.from({ length: n }, (_, i) => `${y}-${i}`)).filter((k) => byKey.has(k));
    return focusKey && keys.includes(focusKey) ? focusKey : nowKey && keys.includes(nowKey) ? nowKey : keys[0];
  }, [visibleYears, byKey, focusKey, nowKey, n]);

  const isSel = (b: Brick) => !weekly && !!selected && selected.year === b.month?.year && selected.month === b.month?.month;
  const cellClass = (b: Brick) => {
    const cls = ['day'];
    if (mode === 'counts') cls.push(`lv${levels.level(b.count)}`);
    else cls.push(`vs${vsLevel(b.vs_avg_pct) + 2}`);
    if (b.provisional) cls.push('is-prov');
    if (b.uncertain) cls.push('is-unc');
    if (flashKey === b.key) cls.push('is-flash');
    if (b.key === nowKey) cls.push('is-now');
    if (isSel(b)) cls.push('is-sel');
    return cls.join(' ');
  };

  const describe = (b: Brick) =>
    `${b.title.replace(' · ', ', ')}: ${b.count ? `fire detected, ${levelWord(levels, b.count).toLowerCase()}, ${pctLong(b.vs_avg_pct)}` : 'no fire detected'}` +
    (b.partial ? `, first ${b.days_covered} days only` : '') +
    (b.provisional ? ', provisional' : '') +
    (b.uncertain ? ', uncertain' : '');

  const ahead = !bricks.some((b) => b.year > refYear);
  const next = refYear + 1;
  // a coming week/month: the same colours as the past, faded (an estimate from the average, not a forecast)
  const typicalCell = (y: number, col: number, at: number) => {
    const mean = avg.get(col);
    const label = typLabel(y, col);
    const lv = levels.level(mean);
    return (
      <div className={'cell is-future' + (y > refYear ? '' : ' is-rest')} key={col} style={{ '--c': at } as React.CSSProperties}>
        <span className={`day est ${mode === 'counts' ? `lv${typLv(mean)}` : 'vs2'}`} role="img"
          aria-label={`${label}: estimate, usually ${LEVEL_WORDS[lv].toLowerCase()} (typical ${period}, not a forecast)`}
          onClick={(e) => (tip?.el === e.currentTarget ? hideTip() : showTyp(e.currentTarget, label, mean))}
          onPointerEnter={onRest((el) => showTyp(el, label, mean))} onPointerLeave={() => { stopDwell(); hideTip(); }} />
      </div>
    );
  };
  const emptyCell = (col: number) => <div className="cell" key={col}><span className="day empty" aria-hidden="true" /></div>;
  /** one year as its lines of bricks */
  const yearLines = (cell: (col: number, at: number) => React.ReactNode) =>
    lines.map(([a, b]) => (
      <div className="yr-line" key={a}>{Array.from({ length: b - a + 1 }, (_, i) => cell(a + i, i))}</div>
    ));

  return (
    <section className="cal" aria-labelledby="cal-title">
      <div className="cal-head">
        <div>
          <h2 id="cal-title">Fire calendar</h2>
          <p className="muted">One square per {unit}. {mode === 'counts' ? 'Darker means more fire.' : 'Orange is above typical, purple below.'}</p>
        </div>
        <div className="tools">
          <div className="seg seg-small" role="radiogroup" aria-label="What the colour shows">
            <button role="radio" aria-checked={mode === 'counts'} className={mode === 'counts' ? 'on' : ''} onClick={() => onMode('counts')}>Intensity</button>
            <button role="radio" aria-checked={mode === 'vs'} className={mode === 'vs' ? 'on' : ''} onClick={() => onMode('vs')}>vs typical</button>
          </div>
          <button className="btn btn-ghost btn-small" onClick={onCsv} title="Download the calendar as a CSV file" aria-label="Download the calendar as a CSV file">CSV</button>
        </div>
      </div>

      <p className="sr-only">In the calendar, the arrow keys move between {unit}s and years; Enter opens a {unit}.</p>
      <div ref={gridRef} className="cal-grid" data-period={unit} style={{ '--n': n, '--per': per } as React.CSSProperties} onKeyDown={moveFocus}>
        {/* one year forward: next year as it usually is (history, not a forecast) */}
        {ahead && data.average_period && (
          <div className="cal-future">
            <p className="yr cal-est" aria-hidden="true"><span className="yr-label" /><b>Estimate</b></p>
            <div className="yr yr-ahead">
              <div className="yr-label">{next}</div>
              <div className="yr-months">{yearLines((col, at) => (col < colsIn(next) ? typicalCell(next, col, at) : emptyCell(col)))}</div>
            </div>
          </div>
        )}
        {visibleYears.map((y) => (
          <div className="yr" key={y}>
            <div className="yr-label">{y}</div>
            <div className="yr-months">
              {yearLines((col, at) => {
                const b = byKey.get(`${y}-${col}`);
                if (!b) {
                  // the rest of this year: what is typical, faded; week 53 stays empty in 52-week years
                  const future = y === refYear && col > refCol && col < colsIn(y);
                  return future && data.average_period ? typicalCell(y, col, at) : emptyCell(col);
                }
                return (
                  <div className="cell" key={col} style={{ '--c': at } as React.CSSProperties}>
                    <button className={cellClass(b)} data-key={b.key} aria-label={describe(b)} aria-haspopup="dialog" aria-expanded={pop?.item.key === b.key}
                      tabIndex={b.key === stopKey ? 0 : -1}
                      onClick={(e) => { stopDwell(); hideTip(); setPop(pop?.item.key === b.key ? null : { item: b, el: e.currentTarget, focus: true }); }}
                      onPointerEnter={onRest((el) => { hideTip(); setPop({ item: b, el }); })} onPointerLeave={stopDwell}
                      onFocus={(e) => { setFocusKey(b.key); onFocusTip(b)(e); }} onBlur={hideTip} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="cal-foot">
        <div className="cal-more">
          {shown < years.length && (
            <button className="btn btn-ghost btn-small" onClick={() => setShown((k) => Math.min(years.length, k + 10))} aria-label={`See more years (${visibleYears.length} of ${years.length} shown)`}>See more</button>
          )}
          {shown > FIRST && <button className="btn btn-ghost btn-small" onClick={() => setShown(FIRST)}>See less</button>}
        </div>
        <Legend mode={mode} thresholds={levels.thresholds} unit={unit} />
      </div>
      <ul className="cal-keys">
        <li><span className={`day mini est ${mode === 'counts' ? 'lv2' : 'vs2'}`} />Faded: estimate from past years, not a forecast</li>
        <li><span className="day mini lv0 is-now" />This {unit}</li>
        <li><span className={`day mini is-prov ${mode === 'counts' ? 'lv2' : 'vs3'}`} />Provisional (recent data)</li>
        <li><span className={`day mini is-unc ${mode === 'counts' ? 'lv2' : 'vs3'}`} />Uncertain (very few fires)</li>
      </ul>

      {tip && (
        <div className="cal-tip" role="presentation" aria-hidden="true"
          style={{ left: Math.min(Math.max(tip.x, 158), window.innerWidth - 158) /* half the tip + 8px from the screen edge */, top: tip.y }}>
          {tip.item ? (
            tip.item.week ? (
              // "Week 46 · 9–15 Nov 2026" / "54 fire-days · −93% vs usual (2003–2025)"
              <>
                <b>{tip.item.title}</b>
                <span>
                  {tip.item.count == null ? 'No data' : `${num(tip.item.count)} fire-day${tip.item.count === 1 ? '' : 's'}`}
                  {tip.item.vs_avg_pct != null && <> · <wbr /><span className="nowrap">{signedPct(tip.item.vs_avg_pct)} vs usual ({period})</span></>}
                </span>
                {tip.item.partial && <span>Week in progress: {tip.item.days_covered} of 7 days</span>}
              </>
            ) : (
              <>
                <b>{MON[tip.item.col]} {tip.item.year} · {levelWord(levels, tip.item.count)}</b>
                {!!tip.item.count && <span>{vsTypical(tip.item.vs_avg_pct)}</span>}
              </>
            )
          ) : tip.typ && (
            <>
              <b>{tip.typ.label}</b>
              <span>Estimate: usually {LEVEL_WORDS[levels.level(tip.typ.mean)].toLowerCase()}</span>
            </>
          )}
        </div>
      )}
      {pop && popPos && (() => {
        const i = pop.item;
        const what = i.week ? `week ${i.week.week}` : MONTHS[i.col];
        const monthName = i.month ? MONTHS[i.month.month - 1] : '';
        const flags = [
          i.partial && (i.week
            ? `Week in progress: the first ${i.days_covered} days, compared with a typical week scaled to those days.`
            : `Month in progress: the first ${i.days_covered} days, compared with the same days in other years.`),
          i.provisional && 'Provisional: recent data that NASA may still revise.',
          i.uncertain && 'Uncertain: very few fires, so the comparison is shaky.',
        ].filter(Boolean) as string[];
        const shut = (focus = true) => { setPop(null); if (focus) pop.el.focus({ preventScroll: true }); };
        const m = i.month;
        return (
          <div ref={popRef} className={'cal-pop' + (popPos.below ? ' is-below' : ' is-above')} role="dialog" aria-label={i.title}
            style={{ left: popPos.left, top: popPos.top }}>
            <p className="cal-pop-title">{i.title}</p>
            <p className="cal-pop-main">
              <span className={`day mini ${mode === 'counts' ? `lv${levels.level(i.count)}` : `vs${vsLevel(i.vs_avg_pct) + 2}`}`} aria-hidden="true" />
              {i.count ? <>Fire detected · <b>{levelWord(levels, i.count)}</b></> : 'No fire detected'}
            </p>
            {i.week && i.count != null && (
              <p className="cal-pop-num">{num(i.count)} fire-day{i.count === 1 ? '' : 's'}{i.vs_avg_pct != null && <> · {signedPct(i.vs_avg_pct)} vs usual</>}</p>
            )}
            {!!i.count && <p>{i.vs_avg_pct == null ? `No typical ${what} to compare with yet.` : <>{vsTypical(i.vs_avg_pct)} for {what}.</>}</p>}
            {flags.length ? flags.map((f) => <p className="cal-pop-flag" key={f}>{f}</p>) : <p className="cal-pop-flag">Final data.</p>}
            {m && (
              <div className="cal-pop-act">
                <button className="btn btn-dark btn-small" onClick={() => { shut(); onOpenMap(m); }}>{i.week ? `${monthName} on the map` : 'Open on the map'}</button>
                <button className="btn btn-ghost btn-small" onClick={() => { shut(); onSelect(m); }}>{i.week ? `${monthName} details` : 'Details'}</button>
              </div>
            )}
          </div>
        );
      })()}
    </section>
  );
}

/** GitHub-style: Less ▢▢▢▢▢ More, with the value where each colour starts. */
function Legend({ mode, thresholds, unit }: { mode: Mode; thresholds: number[]; unit: string }) {
  const t = thresholds.map((x) => (isFinite(x) ? compact(x) : '–'));
  const values = mode === 'counts' ? ['0', ...t] : VS_LABELS;
  return (
    <div className="legend" role="img"
      aria-label={mode === 'counts'
        ? `Colour scale, less to more fire. The five colours start at ${values.join(', ')} satellite-adjusted fire detections in the ${unit}.`
        : `Colour scale: purple is below a typical ${unit}, grey is typical, orange is above.`}>
      <span className="legend-end">{mode === 'counts' ? 'Less' : 'Below'}</span>
      <ol>
        {values.map((v, i) => (
          <li key={i} title={mode === 'counts' ? `${LEVEL_WORDS[i]}: from ${v} satellite-adjusted fire detections in the ${unit} (${num(isFinite(thresholds[i - 1]) ? thresholds[i - 1] : 0)}+)` : v}>
            <span className={`day mini ${mode === 'counts' ? 'lv' : 'vs'}${i}`} /><small>{v}</small>
          </li>
        ))}
      </ol>
      <span className="legend-end">{mode === 'counts' ? 'More' : 'Above'}</span>
    </div>
  );
}
