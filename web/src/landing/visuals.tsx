// The product's own UI, drawn on the landing page as live HTML from the same data the tool shows
// (api.getShowcase: the Pantanal preset from the API, or the demo files when there is no API).
// Nothing is computed here but positions and colours: every number is the API's.
import type { CSSProperties } from 'react';
import type { Showcase } from '../api';
import type { CalendarItem, SatelliteKey } from '../types';
import { SATELLITES } from '../types';
import { COUNTS_SCALE, FRP_STOPS } from '../colors';
import { MON, MONTHS, dateShort, headlineFor, num, ordinal, rankLine, trendOf } from '../format';

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

const frpColour = (frp: number | null) => {
  let colour = FRP_STOPS[0][1];
  for (const [from, c] of FRP_STOPS) if ((frp ?? 0) >= from) colour = c;
  return colour;
};

/** The app in a frame: the brick calendar (as the tool's sheet draws it) beside the busiest month on the map. */
export function AppFrame({ show }: { show: Show }) {
  if (!show) return <div className="ui app fill bfc-app" aria-hidden="true"><div className="app__pane app__pane--list" /><div className="app__pane app__pane--open" /></div>;
  const sel = show.month;

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
  const label = `The fire calendar app: the burning calendar for the ${show.areaName}` +
    (sel ? `, and ${MONTHS[sel.month - 1]} ${sel.year} on the map` : '') +
    (h ? ` with ${num(h.returned)} of ${num(h.total)} hotspots` : '') + (show.demo ? ' (demo data)' : '');

  return (
    <div className="ui app fill bfc-app" role="img" aria-label={label}>
      <div className="app__pane app__pane--list bfc-pane-sheet">
        <HowCalendar show={show} rows={sel ? Math.max(10, show.analysis.cards.ref_year - sel.year + 1) : 10} mark={sel} />
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
          <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} className="bfc-map__box" />
          {pts.map((p, i) => <circle key={i} cx={p.xy[0].toFixed(1)} cy={p.xy[1].toFixed(1)} r="5" fill={p.colour} />)}
        </svg>
      </div>
    </div>
  );
}

// ---------- satellites timeline (facts from the README: NASA FIRMS coverage) ----------
const LANES: { key: SatelliteKey; from: number; to: number | null; label: string; badge?: string }[] = [
  { key: 'modis_terra', from: 2000 + 10 / 12, to: null, label: 'Nov 2000 to today' },
  { key: 'modis_aqua', from: 2002 + 6 / 12, to: null, label: 'Jul 2002 to today' },
  { key: 'viirs_snpp', from: 2012 + 0.6 / 12, to: 2026 + 10 / 12, label: 'Jan 2012 to 2 Nov 2026', badge: 'Ended' },
  { key: 'viirs_noaa20', from: 2018 + 3 / 12, to: null, label: 'Apr 2018 to today', badge: 'Reference scale' },
];

export function Timeline() {
  const now = new Date();
  const today = now.getUTCFullYear() + (now.getUTCMonth() + 0.5) / 12;
  const Y0 = 2000, Y1 = Math.max(2027, now.getUTCFullYear() + 1);
  const pos = (year: number) => ((year - Y0) / (Y1 - Y0)) * 100;
  return (
    <div className="bfc-tl" role="img"
      aria-label="Satellite coverage: MODIS Terra from November 2000, MODIS Aqua from July 2002, VIIRS S-NPP from January 2012 until it ended on 2 November 2026, VIIRS NOAA-20 from April 2018, the reference scale for every count. The calendar starts in January 2003.">
      <div className="bfc-tl__start" style={{ left: `calc(var(--lane-name) + (100% - var(--lane-name)) * ${(pos(2003) / 100).toFixed(4)})` }}>
        <span>Calendar starts, Jan 2003</span>
      </div>
      {LANES.map((l) => (
        <div className="bfc-lane" key={l.key}>
          <div className="bfc-lane__name">
            <b>{SAT[l.key].name}</b>
            <span>{SAT[l.key].px}{l.badge && <i className={'bfc-badge' + (l.to ? '' : ' bfc-badge--ref')}>{l.badge}</i>}</span>
          </div>
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

// ---------- "How it works": the tool's three screens, drawn as they look in #/app ----------

/** Step 1, the location step ("Where should we look?"), as LocationGate.tsx draws it. */
export function HowPlace() {
  return (
    <div className="bfc-how-ui bfc-how-ui--dark" aria-hidden="true">
      <small>Step 1</small>
      <b className="bfc-how-ui__h">Where should we look?</b>
      <span className="bfc-how-ui__btn">Use my location</span>
      <span className="bfc-how-ui__or">or pick a region</span>
      <span className="bfc-how-ui__chips"><i>All of Brazil</i><i className="is-on">Pantanal</i><i>Roraima</i><i>Southern Amazon</i></span>
      <span className="bfc-how-ui__or">or a point and a radius</span>
      <span className="bfc-how-ui__seg"><i>25 km</i><i>50 km</i><i className="is-on">100 km</i><i>250 km</i></span>
    </div>
  );
}

/** Step 2, the one message at the top of the tool (Tool.tsx, Hero): the same wording functions. */
export function HowAnswer({ show }: { show: Show }) {
  const c = show?.analysis.cards;
  const trend = c ? trendOf(c) : null;
  const rank = c ? rankLine(c) : null;
  return (
    <div className="bfc-how-ui bfc-how-ui--dark" aria-hidden="true">
      <small>{c ? `${MONTHS[c.ref_month - 1]} ${c.ref_year}${c.partial ? ` · first ${c.days_covered} days` : ''} · ${show?.areaName}` : ' '}</small>
      <b className="bfc-how-ui__h bfc-how-ui__h--big">
        {trend && <span className={`bfc-how-ui__mark is-${trend}`}>{trend === 'up' ? '▲' : trend === 'down' ? '▼' : '●'} </span>}
        {c ? headlineFor(c) : ' '}
      </b>
      {rank && <span className="bfc-how-ui__rank">{rank}</span>}
      <ul className="bfc-how-ui__ctx">
        {c?.peak_month != null && <li>Fires here usually peak in <b>{MONTHS[c.peak_month - 1]}</b></li>}
        <li>History from satellite detections, not a forecast</li>
        <li>Smoke from fires can lower air quality nearby</li>
      </ul>
      {show?.demo && <Demo />}
    </div>
  );
}

/** Step 3, the quick-view calendar on the white sheet (FireCalendar.tsx): rounded bricks, same level rule. */
export function HowCalendar({ show, rows = 6, mark }: { show: Show; rows?: number; mark?: CalendarItem | null }) {
  const items = show?.analysis.calendar ?? [];
  const v = items.map((i) => i.count).filter((n): n is number => n != null && n > 0).sort((a, b) => a - b);
  const q = (p: number) => (v.length ? v[Math.min(v.length - 1, Math.floor(p * v.length))] : Infinity);
  const t = [q(0.5), q(0.75), q(0.9), q(0.97)];
  const level = (n: number | null) => (n == null ? 0 : n >= t[3] ? 4 : n >= t[2] ? 3 : n >= t[1] ? 2 : n >= t[0] ? 1 : 0);
  const data = show && calendarOf(show);
  const ref = show?.analysis.cards.ref_year ?? new Date().getFullYear();
  const years = Array.from({ length: rows }, (_, k) => ref - k);
  return (
    <div className="bfc-how-ui bfc-how-ui--sheet" aria-hidden="true">
      <b className="bfc-how-ui__h">Burning calendar</b>
      <div className="bfc-qc">
        <span />{MON.map((m) => <em key={m}>{m[0]}</em>)}
        {/* next year: the typical months, dotted, as in the tool (history, not a forecast) */}
        {show && [
          <span key="typ" className="bfc-qc__typ">{ref + 1}</span>,
          ...MON.map((m, i) => {
            const a = show.analysis.average_by_month.find((x) => x.month === i + 1);
            return <i key={`typ${m}`} className={`bfc-qc__d is-typ lv${level(a?.mean ?? null)}`} />;
          }),
        ]}
        {years.map((y) => [
          <span key={y}>{show ? y : ''}</span>,
          ...MON.map((m, i) => {
            const c = data?.cal.get(`${y}-${i + 1}`);
            const lv = c ? level(c.count) : -1;
            const later = !c && show != null && y === ref && i + 1 > show.analysis.cards.ref_month;
            if (later) {
              const a = show.analysis.average_by_month.find((x) => x.month === i + 1);
              return <i key={`${y}${m}`} className={`bfc-qc__d is-typ lv${level(a?.mean ?? null)}`} />;
            }
            return <i key={`${y}${m}`} className={'bfc-qc__d' + (lv < 0 ? ' is-none' : ` lv${lv}`) + (c?.provisional ? ' is-prov' : '') + (mark && mark.year === y && mark.month === i + 1 ? ' is-sel' : '')} />;
          }),
        ])}
      </div>
    </div>
  );
}
