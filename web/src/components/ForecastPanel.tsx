import { useEffect, useState } from 'react';
import { ApiError, getForecast } from '../api';
import type { AreaGeometry, Forecast } from '../types';
import { dateShort, num } from '../format';

// Next-week fire chance: the science team's model (POST /api/forecast), the ONLY forecast in the app.
// Every number is the API's; the browser only formats them. Its `label` is always shown next to them.

/** The model is fed with VIIRS NOAA-20 data, so it cannot replay a date before this (docs/api-contract.md). */
const FIRST_FORECAST_DAY = '2018-04-29';

const INTENSITY = { low: 'Low', medium: 'Medium', high: 'High' } as const;

type Load =
  | { kind: 'loading' }
  | { kind: 'ok'; data: Forecast }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string };

/** "2026-11-14", "2026-11-20" -> "14–20 Nov 2026" (same month) or "28 Nov – 4 Dec 2026" */
function period(from: string, to: string): string {
  const a = dateShort(from).split(' ');
  const b = dateShort(to).split(' ');
  if (a.length !== 3 || b.length !== 3) return `${from} – ${to}`;
  if (a[2] !== b[2]) return `${dateShort(from)} – ${dateShort(to)}`;
  if (a[1] !== b[1]) return `${a[0]} ${a[1]} – ${b.join(' ')}`;
  return `${a[0]}–${b.join(' ')}`;
}

const pct1 = (p: number) => p.toLocaleString('en-GB', { maximumFractionDigits: p < 10 ? 1 : 0 });

export default function ForecastPanel({ area, refDate, available }: {
  area: AreaGeometry;
  /** the past day the page is replayed on, null for today */
  refDate: string | null;
  /** `/api/status` → `forecast_available`; false hides the panel */
  available: boolean;
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
        else setLoad({ kind: 'error', message: e instanceof ApiError ? e.message : 'Something went wrong while loading the estimate.' });
      });
    return () => {
      alive = false;
    };
  }, [area, refDate, available, tooEarly, attempt]);

  if (!available) return null;

  const retry = () => setAttempt((n) => n + 1);
  const label = load.kind === 'ok' ? load.data.label : 'Model estimate (experimental), not an official fire warning.';

  return (
    <section className="fc" aria-labelledby="fc-title" aria-busy={load.kind === 'loading' || undefined}>
      <div className="upcoming-head">
        <h2 id="fc-title">Chance of fire next week</h2>
        <span className="tag tag-model">{label}</span>
      </div>

      {tooEarly ? (
        <p className="muted">The next-week model needs VIIRS NOAA-20 data, which starts in 2018. Pick a reference date from {dateShort(FIRST_FORECAST_DAY)} on to replay it.</p>
      ) : load.kind === 'loading' ? (
        <div className="fc-stats" aria-label="Loading the model estimate">
          <div className="sk fc-sk" /><div className="sk fc-sk" /><div className="sk fc-sk" />
        </div>
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
  return (
    <>
      <p className="fc-period">
        {period(f.period.from, f.period.to)} <span className="muted">· {num(s.cells)} cells of {f.cell_size_km}&nbsp;km that have burned before</span>
      </p>
      {s.cells > 0 ? (
        <dl className="fc-stats">
          <div>
            <dt>Cells likely to see fire</dt>
            <dd>
              <span className="fc-val">{s.expected_cells_with_fire == null ? '–' : `about ${num(s.expected_cells_with_fire)}`}</span>
              <span className="muted">of {num(s.cells)}{s.expected_share_pct != null && <> ({pct1(s.expected_share_pct)}%)</>}</span>
            </dd>
          </div>
          <div>
            <dt>Highest chance in one cell</dt>
            <dd><span className="fc-val">{s.max_probability == null ? '–' : `${pct1(s.max_probability * 100)}%`}</span></dd>
          </div>
          <div>
            <dt>Likely strength if it burns</dt>
            <dd><span className="fc-val">{s.intensity_if_fire ? INTENSITY[s.intensity_if_fire] : '–'}</span></dd>
          </div>
        </dl>
      ) : (
        <p className="muted">No 5&nbsp;km cell in this area has burned before, so the model has nothing to estimate here.</p>
      )}
      {f.notes.length > 0 && (
        <ul className="fc-notes">
          {f.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}
      <p className="muted fc-fine">
        Based on {s.recent_detections == null ? 'the' : num(s.recent_detections)} NASA FIRMS VIIRS NOAA-20 detections here from {dateShort(f.based_on.from)} to {dateShort(f.based_on.to)}, and the usual pattern for this week of the year.
        {f.reliability.note && <> {f.reliability.note}</>}
      </p>
    </>
  );
}
