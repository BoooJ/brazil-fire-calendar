// The landing page's data pictures, drawn as live HTML from the same data the tool shows
// (api.getShowcase: the Pantanal preset from the API, or the demo files when there is no API).
// Nothing is computed here but positions and colour levels: every number is the API's.
// The pictures of the tool itself are real screenshots (landing/shots/), not redrawn here.
import type { Showcase } from '../api';
import type { CalendarItem, SatelliteKey } from '../types';
import { SATELLITES } from '../types';
import { MON, dateShort } from '../format';

type Show = Showcase | null; // null while the numbers load: the frames stand, empty

// Two families, two hues: MODIS in greys, VIIRS in the ember accent (the reference satellite is the full accent).
const SAT: Record<SatelliteKey, { name: string; px: string; colour: string }> = {
  modis_terra: { name: 'MODIS Terra', px: '1 km', colour: '#86868b' },
  modis_aqua: { name: 'MODIS Aqua', px: '1 km', colour: '#b9b9be' },
  viirs_snpp: { name: 'VIIRS S-NPP', px: '375 m', colour: '#f0b193' },
  viirs_noaa20: { name: 'VIIRS NOAA-20', px: '375 m', colour: '#d9480f' },
};

const Demo = () => <span className="l-demo">Demo data</span>;

// ---------- satellites timeline (facts from the README: NASA FIRMS coverage) ----------
const LANES: { key: SatelliteKey; from: number; to: number | null; label: string; badge?: string; ref?: boolean }[] = [
  { key: 'modis_terra', from: 2000 + 10 / 12, to: null, label: 'Since Nov 2000' },
  { key: 'viirs_noaa20', from: 2018 + 3 / 12, to: null, label: 'Since Apr 2018', badge: 'Our reference', ref: true },
];

export function Timeline() {
  const now = new Date();
  const today = now.getUTCFullYear() + (now.getUTCMonth() + 0.5) / 12;
  const Y0 = 2000, Y1 = Math.max(2027, now.getUTCFullYear() + 1);
  const pos = (year: number) => ((year - Y0) / (Y1 - Y0)) * 100;
  return (
    <div className="l-tl" role="img"
      aria-label="Satellite coverage: MODIS Terra from November 2000, VIIRS NOAA-20 from April 2018, the reference every count is converted to. The calendar starts in January 2003.">
      <p className="l-tl__title">Two satellites, one record</p>
      <div className="l-tl__lanes">
        {LANES.map((l) => (
          <div className="l-lane" key={l.key}>
            <div className="l-lane__name">
              <b>{SAT[l.key].name}</b>
              <span>{SAT[l.key].px} · {l.label}</span>
              {l.badge && <i className={l.ref ? 'is-ref' : ''}>{l.badge}</i>}
            </div>
            <div className="l-lane__track">
              <i className={l.to ? 'is-ended' : ''}
                style={{ left: `${pos(l.from).toFixed(2)}%`, width: `${(pos(l.to ?? today) - pos(l.from)).toFixed(2)}%`, background: SAT[l.key].colour }} />
              <em style={{ left: `${pos(2003).toFixed(2)}%` }} />
            </div>
          </div>
        ))}
        <div className="l-tl__ticks" aria-hidden="true">
          {[2003, 2018, now.getUTCFullYear()].map((y) => <span key={y} style={{ left: `${pos(y).toFixed(2)}%` }}>{y}</span>)}
        </div>
      </div>
      <p className="l-tl__note"><i />Where the calendar starts: January 2003.</p>
    </div>
  );
}

/** What each satellite reported per year (stacked) against the one harmonized record: the jump and the fix. */
export function RawVsCorrected({ show }: { show: Show }) {
  const years = (show?.analysis.yearly ?? []).filter((r) => r.complete);
  const raw = (r: (typeof years)[number]) => SATELLITES.reduce((sum, k) => sum + (r.detected[k] ?? 0), 0);
  const rawMax = Math.max(1, ...years.map(raw));
  const countMax = Math.max(1, ...years.map((r) => r.count ?? 0));
  const span = years.length ? `${years[0].year} to ${years[years.length - 1].year}` : '';
  return (
    <div className="l-rc" role="img"
      aria-label={`Detections reported per year jump when the sharper VIIRS sensor arrives in 2018; the harmonized record stays on one scale. ${show?.areaName ?? ''}${span && `, ${span}`}${show?.demo ? ' (demo data)' : ''}.`}>
      <div className="l-rc__head">
        <p>{show ? `${show.areaName}, ${span}` : ' '}</p>
        {show?.demo && <Demo />}
      </div>
      <div className="l-rc__plot">
        {years.map((r) => (
          <div className="l-yb" key={r.year}>
            <div className="l-yb__raw">
              {SATELLITES.map((k) => <i key={k} style={{ height: `${(((r.detected[k] ?? 0) / rawMax) * 100).toFixed(2)}%`, background: SAT[k].colour }} />)}
            </div>
            {r.count != null && <b style={{ bottom: `${((r.count / countMax) * 100).toFixed(2)}%` }} />}
            <span>{r.year % 5 ? '' : r.year}</span>
          </div>
        ))}
      </div>
      <ul className="l-rc__key">
        <li><i style={{ background: SAT.modis_terra.colour }} />MODIS Terra</li>
        <li><i style={{ background: SAT.viirs_noaa20.colour }} />VIIRS NOAA-20</li>
        <li><i className="k-line" />Our one record</li>
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
    <div className="l-step" aria-hidden="true">
      <div className="l-grid">
        {Array.from({ length: 6 * 7 }, (_, i) => {
          const dots = HOT[`${Math.floor(i / 7)}-${i % 7}`];
          return (
            <span key={i} className={dots ? 'is-on' : ''}>
              {dots?.map(([left, top], k) => <i key={k} style={{ left: `${left}%`, top: `${top}%` }} />)}
            </span>
          );
        })}
      </div>
      <p className="l-step__note"><b>{HOTSPOTS}</b> detections, <b>{Object.keys(HOT).length}</b> places that burned</p>
    </div>
  );
}

export function StepConvert() {
  return (
    <div className="l-step" aria-hidden="true">
      <div className="l-conv">
        {SATELLITES.map((k) => <span key={k}><i style={{ background: SAT[k].colour }} />{SAT[k].name}</span>)}
      </div>
      <div className="l-conv__arrow" />
      <div className="l-conv__out">One scale (NOAA-20)</div>
    </div>
  );
}

/** Colour level of a month, by where its count falls among the area's months with fire (display only). */
function levelsOf(items: CalendarItem[]) {
  const v = items.map((i) => i.count).filter((n): n is number => n != null && n > 0).sort((a, b) => a - b);
  const q = (p: number) => (v.length ? v[Math.min(v.length - 1, Math.floor(p * v.length))] : Infinity);
  const t = [q(0.5), q(0.75), q(0.9), q(0.97)];
  return (n: number | null) => (n == null ? 0 : n >= t[3] ? 4 : n >= t[2] ? 3 : n >= t[1] ? 2 : n >= t[0] ? 1 : 0);
}

/** The reference year's row of the calendar, with its provisional and unfinished months marked. */
export function StepProvisional({ show }: { show: Show }) {
  const year = show?.analysis.cards.ref_year ?? new Date().getFullYear();
  const items = show?.analysis.calendar ?? [];
  const level = levelsOf(items);
  return (
    <div className="l-step" aria-hidden="true">
      <div className="l-year">
        <span />{MON.map((m) => <em key={m}>{m[0]}</em>)}
        <span>{show ? year : ''}</span>
        {MON.map((m, i) => {
          const c = items.find((x) => x.year === year && x.month === i + 1);
          return <i key={m} className={!c || c.count == null ? 'is-none' : `lv${level(c.count)}` + (c.partial ? ' is-part' : c.provisional ? ' is-prov' : '')} />;
        })}
      </div>
      <ul className="l-keys">
        <li><i className="lv3" />Final</li>
        <li><i className="lv3 is-prov" />Provisional{show?.finalUntil ? `, after ${dateShort(show.finalUntil)}` : ''}</li>
        <li><i className="lv3 is-part" />Month still in progress</li>
      </ul>
    </div>
  );
}
