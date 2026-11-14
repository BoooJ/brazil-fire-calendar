// The product's own UI, drawn on the landing page as live HTML from the same data the tool shows
// (api.getShowcase: the Pantanal preset from the API, or the demo files when there is no API).
// Nothing is computed here but positions and colours: every number is the API's.
import type { CSSProperties } from 'react';
import type { Showcase } from '../api';
import type { CalendarItem, SatelliteKey } from '../types';
import { SATELLITES } from '../types';
import { COUNTS_SCALE, FRP_STOPS } from '../colors';
import { MON, MONTHS, dateShort, num, ordinal } from '../format';

type Show = Showcase | null; // null while the numbers load: the frames stand, empty

// The satellites as the landing page draws them (the lit frames are light, so these are a little warmer than the charts').
const SAT: Record<SatelliteKey, { name: string; px: string; colour: string }> = {
  modis_terra: { name: 'MODIS Terra', px: '1 km', colour: '#56b4e9' },
  modis_aqua: { name: 'MODIS Aqua', px: '1 km', colour: '#2b8fd6' },
  viirs_snpp: { name: 'VIIRS S-NPP', px: '375 m', colour: '#e8789f' },
  viirs_noaa20: { name: 'VIIRS NOAA-20', px: '375 m', colour: '#f0b44c' },
};

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

/** The calendar's colour for a count: the same log scale as the tool's heatmap. */
function heat(count: number, max: number): { background: string; color: string } {
  const t = Math.log10(count + 1) / Math.log10(max + 1);
  const p = t * (COUNTS_SCALE.length - 1);
  const i = Math.min(Math.floor(p), COUNTS_SCALE.length - 2);
  const a = hex(COUNTS_SCALE[i]), b = hex(COUNTS_SCALE[i + 1]);
  const rgb = a.map((v, k) => Math.round(v + (b[k] - v) * (p - i)));
  return { background: `rgb(${rgb.join(' ')})`, color: t > 0.72 ? '#14100c' : '#f6f1e8' };
}

const short = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const pct = (p: number | null) => (p == null ? '–' : `${p > 0 ? '▲' : p < 0 ? '▼' : ''} ${Math.abs(Math.round(p))}%`);
const tone = (p: number | null) => (p == null || p === 0 ? '' : p > 0 ? 'bfc-up' : 'bfc-down');

function calendarOf(show: Showcase) {
  const cal = new Map<string, CalendarItem>();
  let max = 1;
  for (const c of show.analysis.calendar) {
    cal.set(`${c.year}-${c.month}`, c);
    max = Math.max(max, c.count ?? 0);
  }
  return { cal, max };
}

function Cell({ c, max }: { c: CalendarItem | undefined; max: number }) {
  if (!c || c.count == null) return <i className="bfc-cal__c is-empty" />;
  return (
    <i className={'bfc-cal__c' + (c.provisional ? ' is-prov' : '') + (c.partial ? ' is-part' : '')} style={heat(c.count, max)}>
      {short(c.count)}
    </i>
  );
}

function CalendarRows({ show, years }: { show: Show; years: number[] }) {
  const data = show && calendarOf(show);
  return (
    <>
      <div className="bfc-cal__row bfc-cal__head"><span />{MON.map((m) => <b key={m}>{m}</b>)}</div>
      {years.map((y) => (
        <div className="bfc-cal__row" key={y}>
          <span>{show ? y : ''}</span>
          {MON.map((m, i) => <Cell key={m} c={data?.cal.get(`${y}-${i + 1}`)} max={data?.max ?? 1} />)}
        </div>
      ))}
    </>
  );
}

const Demo = () => <span className="bfc-chip bfc-chip--prov">Demo data</span>;

/** The window on the painted ground: the two key numbers beside the newest finished years of the calendar. */
export function HeroWindow({ show }: { show: Show }) {
  const c = show?.analysis.cards;
  const period = show?.analysis.average_period;
  const last = c ? c.ref_year - 1 : new Date().getFullYear() - 1;
  const years = Array.from({ length: 8 }, (_, i) => last - i);
  return (
    <div className="ly-piece ui bfc-win" aria-hidden="true">
      <div className="bfc-win__bar">
        <span className="bfc-win__dots"><i /><i /><i /></span>
        <span><b>{show?.areaName ?? ' '}</b> · burning calendar</span>
        <span className="bfc-sp" />
        {show?.demo ? <Demo /> : <span className="bfc-win__src">NASA FIRMS · MODIS + VIIRS</span>}
      </div>
      <div className="bfc-win__body">
        <div className="bfc-kpis">
          <div className="bfc-kpi bfc-kpi--hot">
            <small>{c ? `${MONTHS[c.ref_month - 1]} ${c.ref_year}${c.partial ? `, first ${c.days_covered} days` : ''}` : ' '}</small>
            <strong>{c ? num(c.count) : ' '}</strong>
            <span>corrected fire-days</span>
          </div>
          <div className="bfc-kpi">
            <small>{period ? `vs the ${period.from} to ${period.to} average` : 'vs the average'}</small>
            <strong className={c ? tone(c.vs_avg_pct) : ''}>{c ? pct(c.vs_avg_pct) : ' '}</strong>
            <span>{c?.partial ? 'same days, other years' : 'same month, other years'}</span>
          </div>
        </div>
        <div className="bfc-cal"><CalendarRows show={show} years={years} /></div>
      </div>
    </div>
  );
}

/** What the hero window shows, in words (the window itself is hidden from screen readers). */
export function heroWindowLabel(show: Show): string {
  if (!show) return 'The fire calendar: key numbers beside a calendar of monthly fire-days';
  const c = show.analysis.cards;
  return `The fire calendar for the ${show.areaName}: ${num(c.count)} fire-days in ${c.partial ? `the first ${c.days_covered} days of ` : ''}${MONTHS[c.ref_month - 1]} ${c.ref_year}` +
    (c.vs_avg_pct == null ? '' : `, ${Math.abs(Math.round(c.vs_avg_pct))}% ${c.vs_avg_pct < 0 ? 'below' : 'above'} average`) +
    `, beside a calendar of monthly fire-days${show.demo ? ' (demo data)' : ''}`;
}

const frpColour = (frp: number | null) => {
  let colour = FRP_STOPS[0][1];
  for (const [from, c] of FRP_STOPS) if ((frp ?? 0) >= from) colour = c;
  return colour;
};

/** The app in a frame: the list of years beside the busiest month on the map. */
export function AppFrame({ show }: { show: Show }) {
  if (!show) return <div className="ui app fill bfc-app" aria-hidden="true"><div className="app__pane app__pane--list" /><div className="app__pane app__pane--open" /></div>;
  const { cal } = calendarOf(show);
  const a = show.analysis;
  const sel = show.month;
  const years = [...a.yearly].sort((x, y) => y.year - x.year);
  const peak = (year: number) => {
    let best: CalendarItem | null = null;
    for (let m = 1; m <= 12; m++) {
      const c = cal.get(`${year}-${m}`);
      if (c && c.count != null && (!best || c.count > (best.count ?? 0))) best = c;
    }
    return best ? MON[best.month - 1] : null;
  };

  // equirectangular inside the area's box, padded
  const W = 1000, H = 560;
  const [west, south, east, north] = show.bbox;
  const px = (lon: number, lat: number): [number, number] => [
    40 + ((lon - west) / (east - west)) * (W - 80) * 0.62 + (W - 80) * 0.19,
    30 + ((north - lat) / (north - south)) * (H - 60),
  ];
  const [x0, y0] = px(west, north);
  const [x1, y1] = px(east, south);
  const pts = (show.hotspots?.features ?? []).map((f) => ({ xy: px(...f.geometry.coordinates), colour: frpColour(f.properties.frp) }));
  const h = show.hotspots;
  const label = `The fire calendar app: a list of years for the ${show.areaName}` +
    (sel ? ` with ${sel.year} open, and ${MONTHS[sel.month - 1]} ${sel.year} on the map` : '') +
    (h ? ` with ${num(h.returned)} of ${num(h.total)} hotspots` : '') + (show.demo ? ' (demo data)' : '');

  return (
    <div className="ui app fill bfc-app" role="img" aria-label={label}>
      <div className="app__pane app__pane--list">
        <div className="bfc-pane-head"><b>{show.areaName}</b><span>{years.length} years · {num(a.query.area_km2)} km²</span></div>
        <div className="bfc-yrs">
          {years.map((r) => (
            <div className={'bfc-yr' + (r.year === sel?.year ? ' is-on' : '')} key={r.year}>
              <b>{r.year}</b>
              <span>{num(r.count)} fire-days{peak(r.year) && ` · peak ${peak(r.year)}`}</span>
              {r.provisional ? <span className="bfc-chip bfc-chip--prov">Provisional</span> : <span className="bfc-chip">Final</span>}
            </div>
          ))}
        </div>
      </div>
      <div className="app__pane app__pane--open">
        <div className="bfc-pane-head">
          <b>{sel ? `${MONTHS[sel.month - 1]} ${sel.year}` : show.areaName}</b>
          {show.demo ? <Demo /> : <span>{h ? `Showing ${num(h.returned)} of ${num(h.total)} hotspots` : 'Hotspots on the map'}</span>}
        </div>
        {sel && (
          <div className="bfc-stats">
            <div><small>Corrected fire-days</small><strong>{num(sel.count)}</strong></div>
            <div><small>vs average</small><strong className={tone(sel.vs_avg_pct)}>{pct(sel.vs_avg_pct)}</strong></div>
            <div><small>Rank</small><strong>{sel.rank == null ? '–' : <>{ordinal(sel.rank)} <em>of {sel.of_years}</em></>}</strong></div>
            <div><small>Raw hotspots, NOAA-20</small><strong>{num(sel.detected.viirs_noaa20)}</strong></div>
          </div>
        )}
        <svg className="bfc-map" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMin slice" aria-hidden="true">
          <defs>
            <radialGradient id="bfc-glow">
              <stop offset="0" stopColor="#f98e09" stopOpacity=".45" />
              <stop offset="1" stopColor="#f98e09" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} className="bfc-map__box" />
          {pts.filter((_, i) => i % 3 === 0).map((p, i) => <circle key={`g${i}`} cx={p.xy[0].toFixed(1)} cy={p.xy[1].toFixed(1)} r="16" fill="url(#bfc-glow)" data-c="" />)}
          {pts.map((p, i) => <circle key={i} cx={p.xy[0].toFixed(1)} cy={p.xy[1].toFixed(1)} r="5" fill={p.colour} />)}
        </svg>
      </div>
    </div>
  );
}

// ---------- satellites timeline (facts from the README: NASA FIRMS coverage) ----------
const LANES: { key: SatelliteKey; from: number; to: number | null; label: string }[] = [
  { key: 'modis_terra', from: 2000 + 10 / 12, to: null, label: 'Nov 2000 to today' },
  { key: 'modis_aqua', from: 2002 + 6 / 12, to: null, label: 'Jul 2002 to today' },
  { key: 'viirs_snpp', from: 2012 + 0.6 / 12, to: 2026 + 10 / 12, label: 'Jan 2012 to 2 Nov 2026' },
  { key: 'viirs_noaa20', from: 2018 + 3 / 12, to: null, label: 'Apr 2018 to today' },
];

export function Timeline() {
  const now = new Date();
  const today = now.getUTCFullYear() + (now.getUTCMonth() + 0.5) / 12;
  const Y0 = 2000, Y1 = Math.max(2027, now.getUTCFullYear() + 1);
  const pos = (year: number) => ((year - Y0) / (Y1 - Y0)) * 100;
  return (
    <div className="bfc-tl" role="img"
      aria-label="Satellite coverage: MODIS Terra from November 2000, MODIS Aqua from July 2002, VIIRS S-NPP from January 2012 to 2 November 2026, VIIRS NOAA-20 from April 2018. The calendar starts in January 2003.">
      <div className="bfc-tl__start" style={{ left: `calc(var(--lane-name) + (100% - var(--lane-name)) * ${(pos(2003) / 100).toFixed(4)})` }}>
        <span>Calendar starts, Jan 2003</span>
      </div>
      {LANES.map((l) => (
        <div className="bfc-lane" key={l.key}>
          <div className="bfc-lane__name"><b>{SAT[l.key].name}</b><span>{SAT[l.key].px}</span></div>
          <div className="bfc-lane__track">
            <i className={'bfc-lane__bar' + (l.to ? ' is-ended' : '')}
              style={{ left: `${pos(l.from).toFixed(2)}%`, width: `${(pos(l.to ?? today) - pos(l.from)).toFixed(2)}%`, background: SAT[l.key].colour }} />
            <em style={{ left: `${pos(l.from).toFixed(2)}%` }}>{l.label}</em>
          </div>
        </div>
      ))}
      <div className="bfc-tl__axis">
        <div />
        <div className="bfc-tl__ticks">{[2003, 2012, 2018, now.getUTCFullYear()].map((y) => <span key={y} style={{ left: `${pos(y).toFixed(2)}%` }}>{y}</span>)}</div>
      </div>
    </div>
  );
}

/** Raw hotspots per year (stacked by satellite) against the corrected fire-days: the jump and the fix. */
export function RawVsCorrected({ show }: { show: Show }) {
  const years = (show?.analysis.yearly ?? []).filter((r) => r.complete);
  const raw = (r: (typeof years)[number]) => SATELLITES.reduce((sum, k) => sum + (r.detected[k] ?? 0), 0);
  const rawMax = Math.max(1, ...years.map(raw));
  const countMax = Math.max(1, ...years.map((r) => r.count ?? 0));
  const span = years.length ? `${years[0].year} to ${years[years.length - 1].year}` : '';
  return (
    <div className="bfc-rc" role="img"
      aria-label={`Raw hotspots per year jump when VIIRS arrives in 2012 and 2018; corrected fire-days per year stay on one scale. ${show?.areaName ?? ''}${span && `, ${span}`}${show?.demo ? ' (demo data)' : ''}.`}>
      <div className="bfc-rc__plot">
        {years.map((r) => (
          <div className="bfc-yb" key={r.year}>
            <div className="bfc-yb__raw">
              {SATELLITES.map((k) => <i key={k} style={{ height: `${(((r.detected[k] ?? 0) / rawMax) * 100).toFixed(2)}%`, background: SAT[k].colour }} />)}
            </div>
            {r.count != null && <b style={{ bottom: `${((r.count / countMax) * 100).toFixed(2)}%` }} />}
            <span>{r.year % 5 ? '' : r.year}</span>
          </div>
        ))}
      </div>
      <ul className="bfc-rc__key">
        <li><i style={{ background: SAT.modis_terra.colour }} />MODIS</li>
        <li><i style={{ background: SAT.viirs_snpp.colour }} />VIIRS S-NPP</li>
        <li><i style={{ background: SAT.viirs_noaa20.colour }} />VIIRS NOAA-20</li>
        <li><i className="k-line" />Corrected fire-days</li>
        {show?.demo && <li><Demo /></li>}
      </ul>
    </div>
  );
}

// ---------- the three method panels ----------

// Step 1: 23 hotspots fall in 7 cells of a 7 x 6 grid on one day = 7 fire-days.
const HOT: Record<string, [number, number][]> = {
  '1-1': [[30, 28], [52, 44], [66, 62]],
  '1-2': [[24, 30], [58, 22], [44, 60], [70, 70]],
  '2-2': [[34, 34], [60, 56], [26, 66]],
  '3-4': [[30, 24], [62, 36], [42, 62], [72, 70]],
  '4-1': [[40, 34], [64, 60]],
  '4-4': [[26, 26], [54, 40], [36, 66], [70, 58]],
  '5-3': [[30, 44], [58, 30], [62, 66]],
};
const HOTSPOTS = Object.values(HOT).reduce((n, dots) => n + dots.length, 0);

export function StepGrid() {
  return (
    <div className="ui bfc-step bfc-step--grid" aria-hidden="true">
      <div className="bfc-grid">
        {Array.from({ length: 6 * 7 }, (_, i) => {
          const dots = HOT[`${Math.floor(i / 7)}-${i % 7}`];
          return (
            <span key={i} className={dots ? 'is-on' : ''}>
              {dots?.map(([left, top], k) => <i key={k} style={{ left: `${left}%`, top: `${top}%` }} />)}
            </span>
          );
        })}
      </div>
      <div className="bfc-step__note"><b>{Object.keys(HOT).length}</b> fire-days from <b>{HOTSPOTS}</b> hotspots</div>
    </div>
  );
}

export function StepConvert() {
  return (
    <div className="ui bfc-step bfc-step--conv" aria-hidden="true">
      <div className="bfc-conv">
        {SATELLITES.map((k) => <span key={k} style={{ '--c': SAT[k].colour } as CSSProperties}>{SAT[k].name}</span>)}
      </div>
      <div className="bfc-conv__arrow" />
      <div className="bfc-conv__out">NOAA-20 scale</div>
    </div>
  );
}

/** The reference year's row of the calendar, with its provisional and unfinished months marked. */
export function StepProvisional({ show }: { show: Show }) {
  const year = show?.analysis.cards.ref_year ?? new Date().getFullYear();
  return (
    <div className="ui bfc-step bfc-step--prov" aria-hidden="true">
      <div className="bfc-cal bfc-cal--one"><CalendarRows show={show} years={[year]} /></div>
      <ul className="bfc-keys">
        <li><i className="k-final" />Final</li>
        <li><i className="k-prov" />Provisional{show?.finalUntil ? `, after ${dateShort(show.finalUntil)}` : ': near-real-time data'}</li>
        <li><i className="k-part" />Month not finished</li>
      </ul>
    </div>
  );
}
