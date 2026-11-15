// The chart sections of the detailed view: heatmap calendar, typical year, year by year.
// Loaded on demand (this is the only part of the tool that needs ECharts).
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Analysis, CalendarItem } from '../types';
import { BurningCalendar, HeatmapLegend } from './BurningCalendar';
import { TypicalYearChart, YearlyChart } from './Charts';
import { savePng, type EChartHandle } from './EChart';
import type { Mode } from './FireCalendar';
import { MON, MONTHS, compact as short, num, pctLong, pctShort } from '../format';

interface Props {
  data: Analysis;
  mode: Mode;
  onMode: (m: Mode) => void;
  selected: CalendarItem | null;
  onSelect: (item: CalendarItem) => void;
  /** part of the file names, e.g. "pantanal" */
  slug: string;
  onCsv: () => void;
}

function useCompact() {
  const q = '(max-width: 640px)';
  const [c, setC] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const f = () => setC(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return c;
}

export default function Detailed({ data, mode, onMode, selected, onSelect, slug, onCsv }: Props) {
  const compact = useCompact();
  const calRef = useRef<EChartHandle>(null);
  const [table, setTable] = useState(false);
  const typRef = useRef<EChartHandle>(null);
  const yrRef = useRef<EChartHandle>(null);

  const period = data.average_period ? `${data.average_period.from}–${data.average_period.to}` : 'no complete year yet';
  const maxCount = useMemo(() => Math.max(1, ...data.calendar.map((c) => c.count ?? 0)), [data.calendar]);
  const firstYear = data.calendar[0]?.year;
  const sel = useMemo(() => (selected ? { year: selected.year, month: selected.month } : null), [selected]);
  const pick = (year: number, month: number) => {
    const item = data.calendar.find((c) => c.year === year && c.month === month);
    if (item) onSelect(item);
  };

  return (
    <>
      <section className="cal" aria-labelledby="hm-title">
        <div className="cal-head">
          <div>
            <h2 id="hm-title">Burning calendar</h2>
            <p className="muted">Every month since {firstYear}, as a heatmap. {window.matchMedia('(pointer: coarse)').matches ? 'Tap' : 'Click'} a month for details and the map.</p>
          </div>
          <div className="tools">
            <div className="seg seg-dark" role="radiogroup" aria-label="Calendar mode">
              <button role="radio" aria-checked={mode === 'counts'} className={mode === 'counts' ? 'on' : ''} onClick={() => onMode('counts')}>Counts</button>
              <button role="radio" aria-checked={mode === 'vs'} className={mode === 'vs' ? 'on' : ''} onClick={() => onMode('vs')}>vs Average</button>
            </div>
            {/* view switch beside the mode, then the downloads; the label says what you get, so no pressed state */}
            <button className="btn btn-ghost" onClick={() => setTable((t) => !t)} aria-label={table ? 'Show the heatmap' : 'Show as a table'}>{table ? 'Heatmap' : 'Table'}</button>
            <button className="btn btn-ghost" onClick={() => savePng(calRef.current, `burning-calendar-${slug}-${mode}.png`)} aria-label="Download the burning calendar as a PNG image">PNG</button>
            <button className="btn btn-ghost" onClick={onCsv} aria-label="Download the calendar as a CSV file">CSV</button>
          </div>
        </div>
        {table && <CalendarTable data={data} mode={mode} onPick={pick} period={period} />}
        <div className="chart-card" hidden={table}>
          <div className="chart-scroll">
            <BurningCalendar
              ref={calRef}
              calendar={data.calendar}
              average={data.average_by_month}
              yearly={data.yearly}
              mode={mode}
              selected={sel}
              onSelect={pick}
              compact={compact}
              unitMain={data.unit.main}
              period={period}
            />
          </div>
          <HeatmapLegend mode={mode} maxCount={maxCount} />
        </div>
        <p className="fineprint">
          Numbers are {data.unit.main}. * year not complete. The top row is the {period} average: history, not a forecast.
        </p>
      </section>

      <section aria-labelledby="typ-title">
        <div className="cal-head">
          <div>
            <h2 id="typ-title">Typical year</h2>
            <p className="muted">The usual monthly range ({period}) against {data.cards.ref_year}. A hollow point: month not finished.</p>
          </div>
          <button className="btn btn-ghost" onClick={() => savePng(typRef.current, `typical-year-${slug}.png`)} aria-label="Download the typical year chart as a PNG image">PNG</button>
        </div>
        <div className="chart-card">
          <TypicalYearChart ref={typRef} average={data.average_by_month} calendar={data.calendar} refYear={data.cards.ref_year} period={period} compact={compact} />
        </div>
      </section>

      <section aria-labelledby="yr-title">
        <div className="cal-head">
          <div>
            <h2 id="yr-title">Year by year: raw against corrected</h2>
            <p className="muted">The bars jump when VIIRS arrives (2018). The corrected line does not. A hollow point: year not finished.</p>
          </div>
          <button className="btn btn-ghost" onClick={() => savePng(yrRef.current, `year-by-year-${slug}.png`)} aria-label="Download the year-by-year chart as a PNG image">PNG</button>
        </div>
        <div className="chart-card">
          <YearlyChart ref={yrRef} yearly={data.yearly} unitMain={data.unit.main} compact={compact} />
        </div>
      </section>
    </>
  );
}

/** The heatmap as a plain table: every month is a button (keyboard and screen readers), same API values. */
function CalendarTable({ data, mode, onPick, period }: { data: Analysis; mode: Mode; onPick: (year: number, month: number) => void; period: string }) {
  const totals = new Map(data.yearly.map((r) => [r.year, r]));
  const years = [...new Set(data.calendar.map((c) => c.year))].sort((a, b) => b - a);
  const by = new Map(data.calendar.map((c) => [`${c.year}-${c.month}`, c]));
  return (
    <>
    {/* the words sit outside the scrolling box, so a phone shows them whole; the caption stays for screen readers */}
    <p className="cal-table-note" aria-hidden="true">{mode === 'counts' ? 'Corrected count (fire-days)' : 'Compared with the average'} per month, * provisional. Top row: the {period} average (history, not a forecast). Choose a month for details and the map.</p>
    <div className="cal-table-wrap">
      <table className="cal-table">
        <caption className="sr-only">Burning calendar as a table: {mode === 'counts' ? 'corrected count (fire-days)' : 'compared with the average'} per month, * provisional; first row: the {period} average, history, not a forecast; last column: the year's total. Choose a month for details and the map.</caption>
        <thead><tr><th scope="col">Year</th>{MON.map((m) => <th scope="col" key={m}>{m}</th>)}<th scope="col">Total</th></tr></thead>
        <tbody>
          {/* the same average row as the heatmap: the API's monthly means, as they are */}
          <tr className="cal-table-avg">
            <th scope="row">{mode === 'counts' ? 'Average' : 'Average count'}</th>
            {MON.map((m, i) => {
              const a = data.average_by_month.find((x) => x.month === i + 1);
              return <td key={m}>{a?.mean == null ? '–' : short(a.mean)}</td>;
            })}
            <td />
          </tr>
          {years.map((y) => (
            <tr key={y}>
              <th scope="row">{y}</th>
              {MON.map((m, i) => {
                const c = by.get(`${y}-${i + 1}`);
                return (
                  <td key={m}>
                    {c ? (
                      <button className={c.provisional ? 'is-prov' : undefined} onClick={() => onPick(y, i + 1)}>
                        <span className="sr-only">{MONTHS[i]} {y}: </span>
                        {mode === 'counts' ? short(c.count) : pctShort(c.vs_avg_pct)}
                        <span className="sr-only"> ({num(c.count)} fire-days, {pctLong(c.vs_avg_pct)}{c.provisional ? ', provisional' : ''})</span>
                      </button>
                    ) : '–'}
                  </td>
                );
              })}
              <td className="cal-table-total">{(() => { const r = totals.get(y); return r?.count == null ? '–' : short(r.count) + (r.complete ? '' : '*'); })()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}
