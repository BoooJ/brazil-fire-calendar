import { useEffect, useState } from 'react';
import { ApiError, getForecast } from '../api';
import type { AreaGeometry, Forecast } from '../types';
import { dateRange, dateShort, num } from '../format';

// Next-week fire chance: the science team's model (POST /api/forecast), the ONLY forecast in the app.
// Every number is the API's; the browser only formats them. Its `label` is always shown next to them.

/** The model is fed with VIIRS NOAA-20 data, so it cannot replay a date before this (docs/api-contract.md). */
const FIRST_FORECAST_DAY = '2018-04-29';

const INTENSITY = { low: 'Low', medium: 'Medium', high: 'High' } as const;

type Load =
  | { kind: 'loading' }
  | { kind: 'ok'; data: Forecast }
  | { kind: 'unavailable' }
  | { kind: 'note'; message: string }
  | { kind: 'error'; message: string };

const pct1 = (p: number) => p.toLocaleString('en-GB', { maximumFractionDigits: p < 10 ? 1 : 0 });

export default function ForecastPanel({ area, refDate, available, refresh = 0, onShowMap, onHideMap, onShown }: {
  area: AreaGeometry;
  /** the past day the page is replayed on, null for today */
  refDate: string | null;
  /** `/api/status` → `forecast_available`; false hides the panel */
  available: boolean;
  /** bumped when the page reloads its data (Try again, Update now): fetch the estimate again too */
  refresh?: number;
  /** puts the returned cells on the map */
  onShowMap: (f: Forecast) => void;
  /** takes them off again */
  onHideMap: () => void;
  /** true while these cells are on the map */
  onShown: boolean;
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
        <ForecastBody f={load.data} onToggle={() => (onShown ? onHideMap() : onShowMap(load.data))} shown={onShown} />
      )}
    </section>
  );
}

function ForecastBody({ f, onToggle, shown }: { f: Forecast; onToggle: () => void; shown: boolean }) {
  const s = f.summary;
  const [copied, setCopied] = useState<null | 'ok' | 'fail'>(null);
  // the API's own briefing (it already ends with the label), for sharing in a message or a report
  const copy = () => {
    const done = (r: 'ok' | 'fail') => { setCopied(r); setTimeout(() => setCopied(null), 2500); };
    if (!navigator.clipboard || !f.briefing) return done('fail');
    navigator.clipboard.writeText(f.briefing).then(() => done('ok'), () => done('fail'));
  };
  return (
    <>
      <p className="fc-period">
        {dateRange(f.period.from, f.period.to)} <span className="muted">· {num(s.cells)} cells of {f.cell_size_km}&nbsp;km that have burned before</span>
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
      <div className="fc-map-row">
        {f.returned > 0 && (
          /* stays enabled (a disabled button would drop keyboard focus): it hides them again */
          <button className="btn btn-ghost" onClick={onToggle}>
            {shown ? 'Hide the cells from the map' : 'Show the cells on the map'}
          </button>
        )}
        {f.briefing && <button className="btn btn-ghost" onClick={copy}>{copied === 'ok' ? '✓ Copied' : 'Copy as text'}</button>}
        <span className={'copy-note' + (copied === 'ok' ? ' sr-only' : '')} role="status">
          {copied === 'ok' ? 'Estimate copied to the clipboard.' : copied === 'fail' ? 'Could not copy here.' : ''}
        </span>
        {f.returned > 0 && f.truncated && <span className="muted fc-map-note">The map shows the {num(f.returned)} cells with the highest chance, of {num(f.total)}.</span>}
      </div>
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
