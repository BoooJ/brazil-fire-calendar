import { useEffect, useState } from 'react';
import { ApiError, getForecast } from '../api';
import type { AreaGeometry, Forecast } from '../types';
import { dateRange, dateShort, num } from '../format';

// Next-week fire chance: the science team's model (POST /api/forecast), the ONLY forecast in the app.
// Every number is the API's; the browser only formats them. Its `label` is always shown next to them.

/** The model is fed with VIIRS NOAA-20 data, so it cannot replay a date before this (docs/api-contract.md). */
export const FIRST_FORECAST_DAY = '2018-04-29';

const INTENSITY = { low: 'Low', medium: 'Medium', high: 'High' } as const;

type Load =
  | { kind: 'loading' }
  | { kind: 'ok'; data: Forecast }
  | { kind: 'unavailable' }
  | { kind: 'note'; message: string }
  | { kind: 'error'; message: string };

// The model's cells are 0.05° × 0.05° squares (science/forecast, infra/api/forecast.py "cell_deg"), called "5 km" by the API:
// about 31 km² × cos(latitude). Display only: turns the API's cell counts into an area people can picture.
const CELL_DEG = 0.05;
function cellKm2(f: Forecast): number {
  const lats = f.cells.features.map((c) => c.geometry.coordinates[1]);
  const lat = lats.length ? lats.reduce((a, b) => a + b, 0) / lats.length : -15; // Brazil's middle when no cell came back
  const side = CELL_DEG * 111.32;
  return side * side * Math.cos((lat * Math.PI) / 180);
}
/** 98,027 → "98,000", 1,704 → "1,700", 87 → "90", 6 → "6" (it is an estimate: no false precision) */
function km2(n: number): string {
  const r = n >= 1000 ? Math.round(n / 10 ** (Math.floor(Math.log10(n)) - 1)) * 10 ** (Math.floor(Math.log10(n)) - 1) : n >= 100 ? Math.round(n / 10) * 10 : Math.round(n);
  return `${num(r)}\u00a0km²`;
}

const pct1 = (p: number) => p.toLocaleString('en-GB', { maximumFractionDigits: p < 10 ? 1 : 0 });

export default function ForecastPanel({ area, refDate, available, refresh = 0, onLoad }: {
  area: AreaGeometry;
  /** the past day the page is replayed on, null for today */
  refDate: string | null;
  /** `/api/status` → `forecast_available`; false hides the panel */
  available: boolean;
  /** bumped when the page reloads its data (Try again, Update now): fetch the estimate again too */
  refresh?: number;
  /** the estimate once loaded (null while loading or failed): the map's "Fire cells" view draws its cells */
  onLoad?: (f: Forecast | null) => void;
}) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const tooEarly = !!refDate && refDate < FIRST_FORECAST_DAY;

  useEffect(() => {
    if (!available || tooEarly) return;
    let alive = true;
    setLoad({ kind: 'loading' });
    getForecast({ area, ...(refDate ? { ref_date: refDate } : {}) })
      .then((data) => alive && setLoad({ kind: 'ok', data }))
      .catch((e) => {
        if (!alive) return;
        if (e instanceof ApiError && e.code === 'FORECAST_UNAVAILABLE') setLoad({ kind: 'unavailable' });
        else if (e instanceof ApiError && e.code === 'MOCK_ONLY') setLoad({ kind: 'note', message: e.message });
        else setLoad({ kind: 'error', message: e instanceof ApiError ? e.message : 'Something went wrong while loading the estimate.' });
      });
    return () => {
      alive = false;
    };
  }, [area, refDate, available, tooEarly, attempt, refresh]);

  useEffect(() => {
    onLoad?.(available && !tooEarly && load.kind === 'ok' ? load.data : null);
  }, [load, available, tooEarly, onLoad]);

  if (!available) return null;

  const retry = () => setAttempt((n) => n + 1);

  return (
    <section className="fc" aria-labelledby="fc-title" aria-busy={load.kind === 'loading' || undefined}>
      <div className="upcoming-head">
        <h2 id="fc-title" tabIndex={-1}>Chance of fire next week</h2>
      </div>

      {tooEarly ? (
        <p className="muted">The next-week model needs VIIRS NOAA-20 data, which starts in 2018. </p>
      ) : load.kind === 'loading' ? (
        <div className="fc-stats" aria-label="Loading the model estimate">
          <div className="sk fc-sk" /><div className="sk fc-sk" /><div className="sk fc-sk" />
        </div>
      ) : load.kind === 'note' ? (
        <p className="muted">{load.message}</p>
      ) : load.kind === 'unavailable' ? (
        <div className="fc-quiet" role="status">
          <p className="muted">The model is starting up on the server (it takes about 20 seconds). Try again in a moment.</p>
          <button className="btn btn-ghost" onClick={retry}>Try again</button>
        </div>
      ) : load.kind === 'error' ? (
        <div className="fc-quiet" role="alert">
          <p className="muted"><strong>Could not load the estimate.</strong> {load.message}</p>
          <button className="btn btn-ghost" onClick={retry}>Try again</button>
        </div>
      ) : (
        <ForecastBody f={load.data} />
      )}
    </section>
  );
}

function ForecastBody({ f }: { f: Forecast }) {
  const s = f.summary;
  const cell = cellKm2(f);
  // the API's test note, without its "(1 = perfect, 0.5 = coin flip)" aside (also dropped in infra/api/forecast.py)
  const testNote = f.reliability.note?.replace(/\s*\(1 = perfect, 0\.5 = coin flip\)/, '');
  return (
    <>
      <p className="fc-period">
        {dateRange(f.period.from, f.period.to)} <span className="muted">· {num(s.cells)} fire cells (about {km2(s.cells * cell)}) historically registered in the area</span>
      </p>
      {s.cells > 0 ? (
        <dl className="fc-stats">
          <div>
            <dt>Likely to catch fire</dt>
            <dd>
              <span className="fc-val">{s.expected_cells_with_fire == null ? '–' : `${km2(s.expected_cells_with_fire * cell)} at risk`}</span>
              {s.expected_cells_with_fire != null && <span className="muted">{num(s.expected_cells_with_fire)} out of {num(s.cells)} cells{s.expected_share_pct != null && <> ({pct1(s.expected_share_pct)}%)</>}</span>}
            </dd>
          </div>
          <div>
            <dt>Highest chance per cell</dt>
            <dd><span className="fc-val">{s.max_probability == null ? '–' : `${pct1(s.max_probability * 100)}%`}</span></dd>
          </div>
          <div>
            <dt>Estimated intensity</dt>
            <dd><span className="fc-val">{s.intensity_if_fire ? INTENSITY[s.intensity_if_fire] : '–'}</span></dd>
          </div>
        </dl>
      ) : (
        <p className="muted">No 5&nbsp;km cell in this area has burned before, so the model has nothing to estimate here.</p>
      )}
      <div className="fc-map-row">
        {f.returned > 0 && (
          <p className="muted fc-map-hint"><MapIcon /> <span><strong>Fire cells</strong> option is available on the map.</span></p>
        )}
      </div>
      <details className="more">
        <summary>Read more</summary>
        {f.returned > 0 && f.truncated && <p>The map shows the {num(f.returned)} cells with the highest chance, of {num(f.total)}.</p>}
        {f.notes.length > 0 && (
          <ul className="fc-notes">
            {f.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        )}
        <p>
          Based on {s.recent_detections == null ? 'the' : num(s.recent_detections)} NASA FIRMS VIIRS NOAA-20 detections here from {dateShort(f.based_on.from)} to {dateShort(f.based_on.to)}, and the usual pattern for this week of the year.
          {testNote && <> {testNote}</>}
        </p>
      </details>
    </>
  );
}

function MapIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z" /><path d="M9 4v13.5M15 6.5V20" />
    </svg>
  );
}
