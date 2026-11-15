// The burning calendar: years × months, drawn as marked days (filled = happened, dotted = typical).
// The detailed view draws the same months as a dense heatmap: see BurningCalendar.tsx.
import { useMemo } from 'react';
import type { Analysis, CalendarItem } from '../types';
import { MON, MONTHS, compact, num, pctLong, pctShort } from '../format';

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

  const { years, byKey } = useMemo(() => {
    const byKey = new Map<string, CalendarItem>();
    const ys = new Set<number>();
    for (const c of data.calendar) {
      byKey.set(`${c.year}-${c.month}`, c);
      ys.add(c.year);
    }
    return { years: [...ys].sort((a, b) => b - a), byKey };
  }, [data.calendar]);

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
    `${MONTHS[i.month - 1]} ${i.year}: ${num(i.count)} fire-days, ${pctLong(i.vs_avg_pct)}` +
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

      <div className="cal-grid">
        <div className="yr yr-colhead" aria-hidden="true">
          <div className="yr-label" />
          <div className="yr-months">{MON.map((m) => <span key={m}>{m}</span>)}</div>
          <div className="yr-total">Year</div>
        </div>

        {/* typical year = the average row */}
        <div className="yr yr-typical">
          <div className="yr-label">Typical<small>{period}</small></div>
          <div className="yr-months">
            {MON.map((m, idx) => {
              const a = avg.get(idx + 1);
              return (
                <div className="cell" key={m}>
                  <span className={`day typical lv${levels.level(a?.mean ?? null)}`} role="img"
                    aria-label={`${MONTHS[idx]}, average ${period}: ${num(a?.mean)} fire-days (history, not a forecast)`}
                    title={`${MONTHS[idx]}, average ${period}: ${num(a?.mean)} fire-days (history, not a forecast)`}>
                    {compact(a?.mean)}
                  </span>
                  <span className="cell-mon" aria-hidden="true">{m}</span>
                </div>
              );
            })}
          </div>
          <div className="yr-total muted">avg</div>
        </div>

        {years.map((y) => {
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
                          <span className={`day typical lv${levels.level(a?.mean ?? null)}`} role="img"
                            aria-label={`${MONTHS[idx]} ${y} is usually around ${num(a?.mean)} fire-days (average ${period}, not a forecast)`}
                            title={`${MONTHS[idx]} is usually around ${num(a?.mean)} fire-days (average ${period}, not a forecast)`}>
                            {compact(a?.mean)}
                          </span>
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
                      <button className={cellClass(item)} onClick={() => onSelect(item)} aria-label={describe(item)} title={describe(item)}>
                        {mode === 'counts' ? compact(item.count) : pctShort(item.vs_avg_pct)}
                      </button>
                      <span className="cell-mon" aria-hidden="true">{m}</span>
                    </div>
                  );
                })}
              </div>
              <div className="yr-total" title={total?.complete === false ? 'Year not complete' : undefined}
                role="img" aria-label={`${y} total: ${num(total?.count)} fire-days${total?.complete === false ? ', year not complete' : ''}`}>
                {compact(total?.count)}
                {total && !total.complete && <span aria-hidden="true">*</span>}
              </div>
            </div>
          );
        })}
      </div>
      <p className="fineprint">
        Numbers are {data.unit.main}. * year not complete. Months are compared with the {period} average.
      </p>
    </section>
  );
}

function Legend({ mode, thresholds, period }: { mode: Mode; thresholds: number[]; period: string }) {
  const t = thresholds.map((x) => (isFinite(x) ? compact(x) : '–'));
  const countLabels = [`under ${t[0]}`, `${t[0]}+`, `${t[1]}+`, `${t[2]}+`, `${t[3]}+`];
  return (
    <div className="legend" aria-label="Legend">
      <div className="legend-row">
        <span className="legend-title">{mode === 'counts' ? 'Fire-days in the month' : `Compared with the ${period} average`}</span>
        <ul>
          {(mode === 'counts' ? countLabels : VS_LABELS).map((l, i) => (
            <li key={l}><span className={`day mini ${mode === 'counts' ? 'lv' : 'vs'}${i}`} />{mode === 'vs' && (i < 2 ? '▼ ' : i > 2 ? '▲ ' : '')}{l}</li>
          ))}
        </ul>
      </div>
      <div className="legend-row">
        <ul>
          <li><span className="day mini typical lv2" />Typical for that month (history, not a forecast)</li>
          <li><span className="day mini lv2 is-prov" />Provisional (hatched): near-real-time data, may still change</li>
          <li><span className="day mini lv2 is-unc" />Uncertain (faded): few fires or a large conversion error</li>
          <li><span className="day mini is-now" />Partial: month in progress, compared day for day</li>
        </ul>
      </div>
    </div>
  );
}
