// The chart sections of the detailed view: heatmap calendar, typical year, year by year.
// Loaded on demand (this is the only part of the tool that needs ECharts).
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Analysis, CalendarItem } from '../types';
import { BurningCalendar, HeatmapLegend } from './BurningCalendar';
import { TypicalYearChart, YearlyChart } from './Charts';
import { savePng, type EChartHandle } from './EChart';
import type { Mode } from './FireCalendar';
import { MON, MONTHS, compact as short, num, pctLong, pctShort } from '../format';

/** how the main number is named on the page (the API's unit.main still uses its old name) */
const UNIT = 'hotspots';

interface Props {
  data: Analysis;
  mode: Mode;
  onMode: (m: Mode) => void;
  selected: CalendarItem | null;
  onSelect: (item: CalendarItem) => void;
  /** part of the file names, e.g. "pantanal" */
  slug: string;
  /** the chosen area's name, for the chart titles */
  place: string;
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

export default function Detailed({ data, mode, onMode, selected, onSelect, slug, place, onCsv }: Props) {
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
            <h2 id="hm-title">Fire calendar</h2>
            <p className="muted">One cell per month since {firstYear}. Darker means more fire.</p>
          </div>
          <div className="tools">
            <div className="seg seg-dark" role="radiogroup" aria-label="Calendar mode">
              <button role="radio" aria-checked={mode === 'counts'} className={mode === 'counts' ? 'on' : ''} onClick={() => onMode('counts')}>Intensity</button>
              <button role="radio" aria-checked={mode === 'vs'} className={mode === 'vs' ? 'on' : ''} onClick={() => onMode('vs')}>vs typical</button>
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
              unitMain={UNIT}
              period={period}
            />
          </div>
          <HeatmapLegend mode={mode} maxCount={maxCount} />
        </div>
        <p className="fineprint">
          Top row: {period} average · * year in progress
        </p>
      </section>

      <section aria-labelledby="typ-title">
        <div className="cal-head">
          <div>
            <h2 id="typ-title">Hotspots in {place} by month</h2>
            <p className="muted">Usual range ({period}) vs {data.cards.ref_year}. Hollow point: month in progress.</p>
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
            <h2 id="yr-title">Year by year</h2>
            <p className="muted">Raw satellite detections (bars) jump when VIIRS arrives in 2018; adjusted hotspots (line) don't. Hollow point: year in progress.</p>
          </div>
          <button className="btn btn-ghost" onClick={() => savePng(yrRef.current, `year-by-year-${slug}.png`)} aria-label="Download the year-by-year chart as a PNG image">PNG</button>
        </div>
        <div className="chart-card">
          <YearlyChart ref={yrRef} yearly={data.yearly} unitMain={UNIT} compact={compact} />
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
    <p className="cal-table-note" aria-hidden="true">{mode === 'counts' ? 'Hotspots' : 'vs typical'} per month · top row: {period} average · * provisional</p>
    <div className="cal-table-wrap">
      <table className="cal-table">
        <caption className="sr-only">Fire calendar as a table: {mode === 'counts' ? 'hotspots' : 'compared with the average'} per month, * provisional; first row: the {period} average; last column: the year's total. Choose a month for details and the map.</caption>
        <thead><tr><th scope="col">Year</th>{MON.map((m) => <th scope="col" key={m}>{m}</th>)}<th scope="col">Total</th></tr></thead>
        <tbody>
          {/* the same average row as the heatmap: the API's monthly means, as they are */}
          <tr className="cal-table-avg">
            <th scope="row">Average</th>
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
                        <span className="sr-only"> ({num(c.count)} hotspots, {pctLong(c.vs_avg_pct)}{c.provisional ? ', provisional' : ''})</span>
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
