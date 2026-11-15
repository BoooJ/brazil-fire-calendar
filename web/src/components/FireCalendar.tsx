// The burning calendar, GitHub-contributions style: one row per year, a rounded brick per month.
// Colour shows intensity (filled = happened, dotted = typical); the numbers are in the tooltip and the month card.
// The detailed view draws the same months as a dense heatmap: see BurningCalendar.tsx.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Analysis, CalendarItem } from '../types';
import { MON, MONTHS, compact, num, pctLong } from '../format';

export type Mode = 'counts' | 'vs';

/** 0 = unmarked … 4 = highest. Thresholds are quantiles of this area's own months (display only). */
function makeCountLevels(items: CalendarItem[]) {
  const v = items.map((i) => i.count).filter((c): c is number => c != null && c > 0).sort((a, b) => a - b);
  const q = (p: number) => (v.length ? v[Math.min(v.length - 1, Math.floor(p * v.length))] : Infinity);
  const t = [q(0.5), q(0.75), q(0.9), q(0.97)];
  return {
    thresholds: t,
    level: (c: number | null) => (c == null ? 0 : c >= t[3] ? 4 : c >= t[2] ? 3 : c >= t[1] ? 2 : c >= t[0] ? 1 : 0),
  };
}

/** -2 … +2 for the diverging scale. */
const vsLevel = (p: number | null) => (p == null ? 0 : p <= -50 ? -2 : p <= -20 ? -1 : p < 20 ? 0 : p < 100 ? 1 : 2);
const VS_LABELS = ['≤ −50%', '−50 to −20%', 'near average (±20%)', '+20 to +100%', '≥ +100%'];

interface Props {
  data: Analysis;
  selected: CalendarItem | null;
  onSelect: (item: CalendarItem) => void;
  mode: Mode;
  onMode: (m: Mode) => void;
  onCsv: () => void;
}

export default function FireCalendar({ data, selected, onSelect, mode, onMode, onCsv }: Props) {
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
      const below = r.bottom + 220 < window.innerHeight;
      setPopPos({ left: Math.min(Math.max(r.left + r.width / 2, 150), window.innerWidth - 150), top: below ? r.bottom + 10 : r.top - 10, below });
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
  const [shown, setShown] = useState(3);
  const visibleYears = years.slice(0, shown);

  const yearTotals = useMemo(() => new Map(data.yearly.map((y) => [y.year, y])), [data.yearly]);
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
    `${MONTHS[i.month - 1]} ${i.year}: ${num(i.count)} (corrected count), ${pctLong(i.vs_avg_pct)}` +
    (i.rank != null ? `, rank ${i.rank} of ${i.of_years}` : '') +
    (i.partial ? `, first ${i.days_covered} days only` : '') +
    (i.provisional ? ', provisional' : '') +
    (i.uncertain ? ', uncertain' : '');

  return (
    <section className="cal" aria-labelledby="cal-title">
      <div className="cal-head">
        <div>
          <h2 id="cal-title">Burning calendar</h2>
          <p className="muted">Every month since {years[years.length - 1]}. Tap a month for details.</p>
        </div>
        <div className="tools">
          <div className="seg seg-dark" role="radiogroup" aria-label="Calendar mode">
            <button role="radio" aria-checked={mode === 'counts'} className={mode === 'counts' ? 'on' : ''} onClick={() => onMode('counts')}>Counts</button>
            <button role="radio" aria-checked={mode === 'vs'} className={mode === 'vs' ? 'on' : ''} onClick={() => onMode('vs')}>vs Average</button>
          </div>
          <button className="btn btn-ghost" onClick={onCsv} title="Download the calendar as a CSV file" aria-label="Download the calendar as a CSV file">CSV</button>
        </div>
      </div>

      <Legend mode={mode} thresholds={levels.thresholds} period={period} />

      {/* Bricks are laid out per period: 12 months now. Weekly bricks need weekly values from the API (we never
          build weeks from hotspots in the browser): set data-period="week" and --n to 52/53 once they exist. */}
      <div className="cal-grid" data-period="month" style={{ '--n': 12 } as React.CSSProperties} onKeyDown={moveFocus}>
        <div className="yr yr-colhead" aria-hidden="true">
          <div className="yr-label" />
          <div className="yr-months">{MON.map((m) => <span key={m} data-i={m[0]}>{m}</span>)}</div>
          <div className="yr-total">Year</div>
        </div>

        {/* The average row. While the API has no months after the reference year it doubles as "one year forward":
            next year's typical months (history, not a forecast), so the same averages are not drawn twice. */}
        {(() => {
          const ahead = !data.calendar.some((c) => c.year > ref_year);
          const next = ref_year + 1;
          return (
            <>
              <div className={`yr yr-typical${ahead ? ' yr-ahead' : ''}`}>
                <div className="yr-label">{ahead ? <>{next}<small>typical</small></> : <>Typical<small>{period}</small></>}</div>
                <div className="yr-months">
                  {MON.map((m, idx) => {
                    const a = avg.get(idx + 1);
                    const text = ahead
                      ? `${MONTHS[idx]} ${next} is usually around ${num(a?.mean)} (typical ${period}; ${data.next_months_label})`
                      : `${MONTHS[idx]}, typical ${period}: ${num(a?.mean)} (history, not a forecast)`;
                    return (
                      <div className="cell" key={m}>
                        <span className={`day typical lv${typLv(a?.mean)}`} role="img" aria-label={text}
                          onPointerEnter={onEnterTyp(ahead ? `${MONTHS[idx]} ${next}` : `${MONTHS[idx]}, typical`, a?.mean)} onPointerLeave={hideTip} />
                        <span className="cell-mon" aria-hidden="true">{m}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="yr-total muted" title={ahead ? data.next_months_label : undefined}>avg</div>
              </div>
              {ahead && <p className="cal-ahead-note">{next} and the rest of {ref_year} show the {period} average. {data.next_months_label}.</p>}
            </>
          );
        })()}
        {visibleYears.map((y) => {
          const total = yearTotals.get(y);
          return (
            <div className="yr" key={y}>
              <div className="yr-label">{y}</div>
              <div className="yr-months">
                {MON.map((m, idx) => {
                  const item = byKey.get(`${y}-${idx + 1}`);
                  if (!item) {
                    // months after the reference date: show what is typical, clearly as history
                    const future = y > ref_year || (y === ref_year && idx + 1 > ref_month);
                    const a = avg.get(idx + 1);
                    return (
                      <div className="cell" key={m}>
                        {future && y === ref_year ? (
                          <span className={`day typical lv${typLv(a?.mean)}`} role="img"
                            aria-label={`${MONTHS[idx]} ${y} is usually around ${num(a?.mean)} (typical ${period}, not a forecast)`}
                            onPointerEnter={onEnterTyp(`${MONTHS[idx]} ${y}`, a?.mean)} onPointerLeave={hideTip} />
                        ) : (
                          <span className="day empty" aria-hidden="true" />
                        )}
                        <span className="cell-mon" aria-hidden="true">{m}</span>
                      </div>
                    );
                  }
                  const isNow = item.year === ref_year && item.month === ref_month;
                  return (
                    <div className="cell" key={m}>
                      {isNow && <span className="now-tag">{item.partial ? 'SO FAR' : 'NOW'}</span>}
                      <button className={cellClass(item)} aria-label={describe(item)} aria-haspopup="dialog" aria-expanded={pop?.item === item}
                        onClick={(e) => { hideTip(); setPop(pop?.item === item ? null : { item, el: e.currentTarget }); }}
                        onPointerEnter={onEnter(item)} onPointerLeave={hideTip} onFocus={onFocusTip(item)} onBlur={hideTip} />
                      <span className="cell-mon" aria-hidden="true">{m}</span>
                    </div>
                  );
                })}
              </div>
              <div className="yr-total" title={total?.complete === false ? 'Year not complete' : undefined}
                role="img" aria-label={`${y} total: ${num(total?.count)}${total?.complete === false ? ', year not complete' : ''}`}>
                {compact(total?.count)}
                {total && !total.complete && <span aria-hidden="true">*</span>}
              </div>
            </div>
          );
        })}
      </div>
      {tip && (
        <div className="cal-tip" role="presentation" aria-hidden="true"
          style={{ left: Math.min(Math.max(tip.x, 120), window.innerWidth - 120), top: tip.y }}>
          {tip.item ? (
            <>
              <b>{MONTHS[tip.item.month - 1]} {tip.item.year}</b>
              <span className="cal-tip-big">{pctLong(tip.item.vs_avg_pct)}</span>
              <span>Corrected count {num(tip.item.count)}</span>
              {(tip.item.partial || tip.item.provisional || tip.item.uncertain) && (
                <span className="cal-tip-flags">
                  {[tip.item.partial && `first ${tip.item.days_covered} days only`, tip.item.provisional && 'provisional', tip.item.uncertain && 'uncertain']
                    .filter(Boolean).join(' · ')}
                </span>
              )}
              <span className="cal-tip-hint">Click for details and the map</span>
            </>
          ) : tip.typ && (
            <>
              <b>{tip.typ.label}</b>
              <span className="cal-tip-big">usually ≈ {num(tip.typ.mean)}</span>
              <span>Typical month, {period} average</span>
              <span className="cal-tip-hint">History, not a forecast</span>
            </>
          )}
        </div>
      )}
      {years.length > 3 && (
        <div className="cal-foot">
          {shown < years.length && (
            <button className="btn btn-ghost" onClick={() => setShown((n) => Math.min(years.length, n + 10))} aria-label="Show more years in the calendar">
              Show more years <span className="muted">({Math.min(10, years.length - shown)} more)</span>
            </button>
          )}
          {shown > 3 && <button className="btn btn-ghost" onClick={() => setShown(3)}>Show less</button>}
          <span className="muted">{visibleYears.length} of {years.length} years</span>
        </div>
      )}
      {pop && popPos && (() => {
        const i = pop.item;
        const typical = avg.get(i.month)?.mean;
        const status = [i.partial && `month in progress (first ${i.days_covered} days)`, i.provisional && 'provisional, may still change', i.uncertain && 'uncertain: few fires']
          .filter(Boolean).join(' · ') || 'final data';
        return (
          <div ref={popRef} className={'cal-pop' + (popPos.below ? ' is-below' : ' is-above')} role="dialog" aria-label={`${MONTHS[i.month - 1]} ${i.year}`}
            style={{ left: popPos.left, top: popPos.top }}>
            <b className="cal-pop-title">{MONTHS[i.month - 1]} {i.year}</b>
            <p className="cal-pop-main">{i.count ? <>Fire detected<br /><b>{num(i.count)}</b> corrected count</> : 'No fire detected this month'}</p>
            <p>{i.vs_avg_pct == null ? 'No typical month to compare with' : <>{pctLong(i.vs_avg_pct)}</>}{typical != null && <> · typical {num(typical)}</>}</p>
            <p className="cal-pop-flag">{status}</p>
            <div className="cal-pop-act">
              <button className="btn btn-fire" onClick={() => { pop.el.focus({ preventScroll: true }); setPop(null); onSelect(i); }}>Details and map</button>
              <button className="btn btn-ghost" onClick={() => { setPop(null); pop.el.focus({ preventScroll: true }); }}>Close</button>
            </div>
          </div>
        );
      })()}
      <p className="fineprint">
        {mode === 'counts'
          ? 'Colour shows how much burned: the corrected count of 1 km squares with fire each day (NOAA-20 scale; see Detailed view).'
          : `Colour shows each month against the same month in the ${period} average: orange above, purple below.`}
        {' '}Year totals on the right, * year not complete. Typical = the {period} average.
      </p>
    </section>
  );
}

function Legend({ mode, thresholds, period }: { mode: Mode; thresholds: number[]; period: string }) {
  const t = thresholds.map((x) => (isFinite(x) ? compact(x) : '–'));
  const countLabels = [`under ${t[0]}`, `${t[0]}+`, `${t[1]}+`, `${t[2]}+`, `${t[3]}+`];
  const marks = (
    <ul>
      <li><span className={`day mini typical ${mode === 'counts' ? 'lv2' : 'lv0'}`} />Typical (history, not a forecast)</li>
      <li><span className="day mini lv2 is-prov" />Provisional: may still change</li>
      <li><span className="day mini lv2 is-unc" />Uncertain: few fires</li>
      <li><span className="day mini is-now" />Month in progress</li>
    </ul>
  );
  return (
    <div className="legend" aria-label="Legend">
      <div className="legend-row">
        <span className="legend-title">{mode === 'counts' ? 'How much burned in the month' : `Compared with the ${period} average`}</span>
        <ul>
          {(mode === 'counts' ? countLabels : VS_LABELS).map((l, i) => (
            <li key={l}><span className={`day mini ${mode === 'counts' ? 'lv' : 'vs'}${i}`} />{mode === 'vs' && (i < 2 ? '▼ ' : i > 2 ? '▲ ' : '')}{l}</li>
          ))}
        </ul>
      </div>
      <div className="legend-row legend-states">{marks}</div>
      {/* phones: the same keys folded away, so the bricks come sooner */}
      <details className="legend-states-phone">
        <summary>What the marks mean</summary>
        {marks}
      </details>
    </div>
  );
}
