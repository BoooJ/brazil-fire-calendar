// The fire calendar, GitHub-contributions style: one row per year, a rounded brick per month.
// Colour alone shows intensity (filled = happened, dashed outline = typical, not a forecast). No numbers in the grid:
// hover names the month, a click opens a small card anchored to the brick, with a link to the map.
// The detailed view draws the same months as a dense heatmap with the numbers: see BurningCalendar.tsx.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Analysis, CalendarItem } from '../types';
import { MON, MONTHS, compact, num, pctLong, vsTypical } from '../format';
import { LEVEL_WORDS, levelWord, makeCountLevels, vsLevel } from '../levels';

export type Mode = 'counts' | 'vs';

const VS_LABELS = ['−50%', '−20%', 'typical', '+20%', '+100%'];
/** years shown before "See more" */
const FIRST = 3;

interface Props {
  data: Analysis;
  selected: CalendarItem | null;
  onSelect: (item: CalendarItem) => void;
  /** opens that month's hotspots on the map */
  onOpenMap: (item: CalendarItem) => void;
  mode: Mode;
  onMode: (m: Mode) => void;
  onCsv: () => void;
}

export default function FireCalendar({ data, selected, onSelect, onOpenMap, mode, onMode, onCsv }: Props) {
  const levels = useMemo(() => makeCountLevels(data.calendar), [data.calendar]);
  // typical bricks: coloured by size in Counts; in vs Average they ARE the average, so they stay neutral
  const typLv = (mean: number | null | undefined) => (mode === 'counts' ? levels.level(mean ?? null) : 0);
  // one tooltip for hover and keyboard focus, styled like the detailed view's chart tooltip
  const [tip, setTip] = useState<{ item: CalendarItem | null; typ?: { label: string; mean: number | null }; el: HTMLElement; x: number; y: number } | null>(null);
  const place = (item: CalendarItem, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setTip({ item, el, x: r.left + r.width / 2, y: r.top });
  };
  // typical (dotted) bricks get the same styled tooltip on mouse hover, instead of the browser's title box
  const onEnterTyp = (label: string, mean: number | null | undefined) => (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ item: null, typ: { label, mean: mean ?? null }, el: e.currentTarget, x: r.left + r.width / 2, y: r.top });
  };
  // mouse hover, or keyboard focus (not a tap: a tap opens the month card instead)
  const onEnter = (item: CalendarItem) => (e: React.PointerEvent<HTMLElement>) => e.pointerType === 'mouse' && place(item, e.currentTarget);
  const onFocusTip = (item: CalendarItem) => (e: React.FocusEvent<HTMLElement>) => e.currentTarget.matches(':focus-visible') && place(item, e.currentTarget);
  const hideTip = () => setTip(null);
  useEffect(() => {
    if (!tip) return;
    const follow = () => {
      const r = tip.el.getBoundingClientRect();
      setTip({ ...tip, x: r.left + r.width / 2, y: r.top });
    };
    window.addEventListener('scroll', follow, { passive: true });
    return () => window.removeEventListener('scroll', follow);
  }, [tip]);

  // click / Enter on a brick: a small card anchored to it, with that month's numbers (all from the API)
  const [pop, setPop] = useState<{ item: CalendarItem; el: HTMLElement } | null>(null);
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
    window.addEventListener('scroll', placePop, { passive: true });
    window.addEventListener('resize', placePop);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('scroll', placePop);
      window.removeEventListener('resize', placePop);
    };
  }, [pop]);

  // arrow keys move between bricks (left/right = months, up/down = years), as in a data grid
  const moveFocus = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const dirs: Record<string, [number, number]> = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
    const d = dirs[e.key];
    const from = e.target as HTMLElement;
    if (!d || !from.matches('button.day')) return;
    const rows = [...e.currentTarget.querySelectorAll<HTMLElement>('.yr')].filter((r) => r.querySelector('button.day'));
    const r = rows.findIndex((row) => row.contains(from));
    const cellsOf = (row: HTMLElement) => [...row.querySelectorAll<HTMLElement>('.yr-months > .cell')];
    const c = cellsOf(rows[r]).findIndex((cell) => cell.contains(from));
    for (let rr = r + d[0], cc = c + d[1]; rr >= 0 && rr < rows.length && cc >= 0 && cc < 12; rr += d[0], cc += d[1]) {
      const btn = cellsOf(rows[rr])[cc]?.querySelector<HTMLElement>('button.day');
      if (btn) {
        e.preventDefault();
        btn.focus();
        return;
      }
    }
  };

  const popShown = !!(pop && popPos);
  useEffect(() => {
    if (popShown) popRef.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  }, [popShown, pop]);

  const { years, byKey } = useMemo(() => {
    const byKey = new Map<string, CalendarItem>();
    const ys = new Set<number>();
    for (const c of data.calendar) {
      byKey.set(`${c.year}-${c.month}`, c);
      ys.add(c.year);
    }
    return { years: [...ys].sort((a, b) => b - a), byKey };
  }, [data.calendar]);

  // the newest three years first; more on request (all the rows stay in the API answer and the CSV)
  const [shown, setShown] = useState(FIRST);
  const visibleYears = years.slice(0, shown);

  // One Tab stop for the whole grid (roving tabindex): the brick last focused, else this month, else the newest.
  // The arrow keys (moveFocus) move between bricks, so Tab goes on to the next control instead of every month.
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const stopKey = useMemo(() => {
    const keys = visibleYears.flatMap((y) => MON.map((_, i) => `${y}-${i + 1}`)).filter((k) => byKey.has(k));
    const nowKey = `${data.cards.ref_year}-${data.cards.ref_month}`;
    return focusKey && keys.includes(focusKey) ? focusKey : keys.includes(nowKey) ? nowKey : keys[0];
  }, [visibleYears, byKey, focusKey, data.cards.ref_year, data.cards.ref_month]);

  const avg = useMemo(() => new Map(data.average_by_month.map((a) => [a.month, a])), [data.average_by_month]);
  const { ref_year, ref_month } = data.cards;
  const period = data.average_period ? `${data.average_period.from}–${data.average_period.to}` : 'no complete year yet';

  const cellClass = (item: CalendarItem) => {
    const cls = ['day'];
    if (mode === 'counts') cls.push(`lv${levels.level(item.count)}`);
    else cls.push(`vs${vsLevel(item.vs_avg_pct) + 2}`);
    if (item.provisional) cls.push('is-prov');
    if (item.uncertain) cls.push('is-unc');
    if (item.year === ref_year && item.month === ref_month) cls.push('is-now');
    if (selected && selected.year === item.year && selected.month === item.month) cls.push('is-sel');
    return cls.join(' ');
  };

  const describe = (i: CalendarItem) =>
    `${MONTHS[i.month - 1]} ${i.year}: ${i.count ? `fire detected, ${levelWord(levels, i.count).toLowerCase()}, ${pctLong(i.vs_avg_pct)}` : 'no fire detected'}` +
    (i.partial ? `, first ${i.days_covered} days only` : '') +
    (i.provisional ? ', provisional' : '') +
    (i.uncertain ? ', uncertain' : '');

  const ahead = !data.calendar.some((c) => c.year > ref_year);
  const next = ref_year + 1;
  const typicalCell = (label: string, idx: number) => {
    const a = avg.get(idx + 1);
    const lv = levels.level(a?.mean);
    return (
      <div className="cell" key={idx}>
        <span className={`day typical lv${typLv(a?.mean)}`} role="img"
          aria-label={`${label}: usually ${LEVEL_WORDS[lv].toLowerCase()} (typical ${period}, not a forecast)`}
          onPointerEnter={onEnterTyp(label, a?.mean)} onPointerLeave={hideTip} />
      </div>
    );
  };

  return (
    <section className="cal" aria-labelledby="cal-title">
      <div className="cal-head">
        <div>
          <h2 id="cal-title">Fire calendar</h2>
          <p className="muted">One square per month. {mode === 'counts' ? 'Darker means more fire.' : 'Orange is above typical, purple below.'}</p>
        </div>
        <div className="tools">
          <div className="seg seg-small" role="radiogroup" aria-label="What the colour shows">
            <button role="radio" aria-checked={mode === 'counts'} className={mode === 'counts' ? 'on' : ''} onClick={() => onMode('counts')}>Intensity</button>
            <button role="radio" aria-checked={mode === 'vs'} className={mode === 'vs' ? 'on' : ''} onClick={() => onMode('vs')}>vs typical</button>
          </div>
          <button className="btn btn-ghost btn-small" onClick={onCsv} title="Download the calendar as a CSV file" aria-label="Download the calendar as a CSV file">CSV</button>
        </div>
      </div>

      {/* Bricks are laid out per period: 12 months now. Weekly bricks need weekly values from the API (we never
          build weeks from hotspots in the browser): set data-period="week" and --n to 52/53 once they exist. */}
      <p className="sr-only">In the calendar, the arrow keys move between months and years; Enter opens a month.</p>
      <div className="cal-grid" data-period="month" style={{ '--n': 12 } as React.CSSProperties} onKeyDown={moveFocus}>
        <div className="yr yr-colhead" aria-hidden="true">
          <div className="yr-label" />
          <div className="yr-months">{MON.map((m) => <span key={m} data-i={m[0]}>{m}</span>)}</div>
        </div>

        {/* one year forward: next year's months as they usually are (history, not a forecast) */}
        {ahead && data.average_period && (
          <div className="yr yr-ahead">
            <div className="yr-label">{next}<small>typical</small></div>
            <div className="yr-months">{MON.map((_, idx) => typicalCell(`${MONTHS[idx]} ${next}`, idx))}</div>
          </div>
        )}
        {visibleYears.map((y) => (
          <div className="yr" key={y}>
            <div className="yr-label">{y}</div>
            <div className="yr-months">
              {MON.map((m, idx) => {
                const item = byKey.get(`${y}-${idx + 1}`);
                if (!item) {
                  // the rest of this year: what is typical, clearly as history
                  const future = y === ref_year && idx + 1 > ref_month;
                  return future && data.average_period ? typicalCell(`${MONTHS[idx]} ${y}`, idx) : <div className="cell" key={m}><span className="day empty" aria-hidden="true" /></div>;
                }
                return (
                  <div className="cell" key={m}>
                    <button className={cellClass(item)} aria-label={describe(item)} aria-haspopup="dialog" aria-expanded={pop?.item === item}
                      tabIndex={`${y}-${idx + 1}` === stopKey ? 0 : -1}
                      onClick={(e) => { hideTip(); setPop(pop?.item === item ? null : { item, el: e.currentTarget }); }}
                      onPointerEnter={onEnter(item)} onPointerLeave={hideTip}
                      onFocus={(e) => { setFocusKey(`${y}-${idx + 1}`); onFocusTip(item)(e); }} onBlur={hideTip} />
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
            <button className="btn btn-ghost btn-small" onClick={() => setShown((n) => Math.min(years.length, n + 10))} aria-label={`See more years (${visibleYears.length} of ${years.length} shown)`}>See more</button>
          )}
          {shown > FIRST && <button className="btn btn-ghost btn-small" onClick={() => setShown(FIRST)}>See less</button>}
        </div>
        <Legend mode={mode} thresholds={levels.thresholds} />
      </div>
      <ul className="cal-keys">
        <li><span className={`day mini typical ${mode === 'counts' ? 'lv2' : 'lv0'}`} />Typical for that month, not a forecast</li>
        <li><span className="day mini lv2 is-prov" />Provisional, may still change</li>
        <li><span className="day mini lv2 is-unc" />Uncertain, very few fires</li>
        <li><span className="day mini lv0 is-now" />This month</li>
      </ul>

      {tip && (
        <div className="cal-tip" role="presentation" aria-hidden="true"
          style={{ left: Math.min(Math.max(tip.x, 110), window.innerWidth - 110) /* half the tip + 8px from the screen edge */, top: tip.y }}>
          {tip.item ? (
            <>
              <b>{MON[tip.item.month - 1]} {tip.item.year} · {levelWord(levels, tip.item.count)}</b>
              {!!tip.item.count && <span>{vsTypical(tip.item.vs_avg_pct)}</span>}
            </>
          ) : tip.typ && (
            <>
              <b>{tip.typ.label}</b>
              <span>Usually {LEVEL_WORDS[levels.level(tip.typ.mean)].toLowerCase()} · not a forecast</span>
            </>
          )}
        </div>
      )}
      {pop && popPos && (() => {
        const i = pop.item;
        const month = MONTHS[i.month - 1];
        const flags = [
          i.partial && `Month in progress: the first ${i.days_covered} days, compared with the same days in other years.`,
          i.provisional && 'Provisional: recent data that NASA may still revise.',
          i.uncertain && 'Uncertain: very few fires, so the comparison is shaky.',
        ].filter(Boolean) as string[];
        const shut = (focus = true) => { setPop(null); if (focus) pop.el.focus({ preventScroll: true }); };
        return (
          <div ref={popRef} className={'cal-pop' + (popPos.below ? ' is-below' : ' is-above')} role="dialog" aria-label={`${month} ${i.year}`}
            style={{ left: popPos.left, top: popPos.top }}>
            <p className="cal-pop-title">{month} {i.year}</p>
            <p className="cal-pop-main">
              <span className={`day mini ${mode === 'counts' ? `lv${levels.level(i.count)}` : `vs${vsLevel(i.vs_avg_pct) + 2}`}`} aria-hidden="true" />
              {i.count ? <>Fire detected · <b>{levelWord(levels, i.count)}</b></> : 'No fire detected'}
            </p>
            {!!i.count && <p>{i.vs_avg_pct == null ? `No typical ${month} to compare with yet.` : <>{vsTypical(i.vs_avg_pct)} for {month}.</>}</p>}
            {flags.length ? flags.map((f) => <p className="cal-pop-flag" key={f}>{f}</p>) : <p className="cal-pop-flag">Final data.</p>}
            <div className="cal-pop-act">
              <button className="btn btn-dark btn-small" onClick={() => { shut(); onOpenMap(i); }}>Open on the map</button>
              <button className="btn btn-ghost btn-small" onClick={() => { shut(); onSelect(i); }}>Details</button>
            </div>
          </div>
        );
      })()}
    </section>
  );
}

/** GitHub-style: Less ▢▢▢▢▢ More, with the value where each colour starts. */
function Legend({ mode, thresholds }: { mode: Mode; thresholds: number[] }) {
  const t = thresholds.map((x) => (isFinite(x) ? compact(x) : '–'));
  const values = mode === 'counts' ? ['0', ...t] : VS_LABELS;
  return (
    <div className="legend" role="img"
      aria-label={mode === 'counts'
        ? `Colour scale, less to more fire. The five colours start at ${values.join(', ')} satellite-adjusted fire detections in the month.`
        : 'Colour scale: purple is below a typical month, grey is typical, orange is above.'}>
      <span className="legend-end">{mode === 'counts' ? 'Less' : 'Below'}</span>
      <ol>
        {values.map((v, i) => (
          <li key={i} title={mode === 'counts' ? `${LEVEL_WORDS[i]}: from ${v} satellite-adjusted fire detections in the month (${num(isFinite(thresholds[i - 1]) ? thresholds[i - 1] : 0)}+)` : v}>
            <span className={`day mini ${mode === 'counts' ? 'lv' : 'vs'}${i}`} /><small>{v}</small>
          </li>
        ))}
      </ol>
      <span className="legend-end">{mode === 'counts' ? 'More' : 'Above'}</span>
    </div>
  );
}
