import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, getAnalysis, getHotspots, getPresets } from '../api';
import type { Analysis, CalendarItem, Preset, SatelliteKey } from '../types';
import type { Area } from '../geo';
import Globe, { BRAZIL_CENTER, zoomForRadius } from '../components/Globe';
import LocationGate, { PinIcon } from '../components/LocationGate';
import FireCalendar from '../components/FireCalendar';
import MonthDetail, { SAT_NAMES, type MapState } from '../components/MonthDetail';
import { MON, MONTHS, dateTime, num } from '../format';

const STORE = 'bfc.area.v1';
const REPLAY_DATE = '2020-09-14';

function loadArea(): Area | null {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as Area) : null;
  } catch {
    return null;
  }
}

type Load = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ok'; data: Analysis };

export default function Tool() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [area, setArea] = useState<Area | null>(loadArea);
  const [picked, setPicked] = useState<{ lon: number; lat: number } | null>(null);
  const [replay, setReplay] = useState(false);
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const [map, setMap] = useState<MapState>({ kind: 'idle' });
  const [points, setPoints] = useState<[number, number][]>([]);
  const [mapMonth, setMapMonth] = useState<string | null>(null);

  useEffect(() => {
    getPresets().then(setPresets).catch(() => setPresets([]));
  }, []);

  useEffect(() => {
    if (!area) return;
    let alive = true;
    setLoad({ kind: 'loading' });
    setSelected(null);
    clearMap();
    getAnalysis({ area: area.polygon, ...(replay ? { ref_date: REPLAY_DATE } : {}) })
      .then((data) => alive && setLoad({ kind: 'ok', data }))
      .catch((e) => alive && setLoad({ kind: 'error', message: e instanceof ApiError ? e.message : 'Something went wrong while loading the data.' }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, replay, attempt]);

  const clearMap = () => {
    setMap({ kind: 'idle' });
    setPoints([]);
    setMapMonth(null);
  };

  const chooseArea = (a: Area | null) => {
    setArea(a);
    setPicked(null);
    try {
      if (a) localStorage.setItem(STORE, JSON.stringify(a));
      else localStorage.removeItem(STORE);
    } catch {
      /* private mode: fine */
    }
  };

  const select = (item: CalendarItem) => {
    setSelected(item);
    if (mapMonth !== `${item.year}-${item.month}`) clearMap();
  };

  const showOnMap = useCallback(() => {
    if (!area || !selected) return;
    setMap({ kind: 'loading' });
    getHotspots({ area: area.polygon, year: selected.year, month: selected.month })
      .then((h) => {
        setPoints(h.features.map((f) => f.geometry.coordinates));
        setMapMonth(`${selected.year}-${selected.month}`);
        setMap({ kind: 'shown', total: h.total, returned: h.returned, truncated: h.truncated });
        if (window.matchMedia('(max-width: 899px)').matches) window.scrollTo({ top: 0, behavior: 'smooth' });
      })
      .catch((e) => setMap({ kind: 'error', message: e instanceof ApiError ? e.message : 'Could not load the hotspots.' }));
  }, [area, selected]);

  const globeCenter = useMemo<[number, number]>(() => {
    if (area) return area.center;
    if (picked && isFinite(picked.lon) && isFinite(picked.lat)) return [picked.lon, picked.lat];
    return BRAZIL_CENTER;
  }, [area, picked]);
  const globeZoom = !area ? 1.5 : points.length ? zoomForRadius(area.radiusDeg) : zoomForRadius(area.radiusDeg, 1.5, 3);
  const globePoints = useMemo<[number, number][]>(
    () => (area ? points : picked && isFinite(picked.lon) && isFinite(picked.lat) ? [[picked.lon, picked.lat]] : []),
    [area, points, picked],
  );

  const data = load.kind === 'ok' ? load.data : null;
  const wide = typeof window !== 'undefined' && window.matchMedia('(min-width: 900px)').matches;

  return (
    <div className="tool">
      <header className="topbar">
        <a className="brand" href="#/">
          <Flame /> Brazil Fire Calendar
        </a>
        {area && (
          <button className="pill" onClick={() => chooseArea(null)} title="Change location">
            <PinIcon /> <span className="pill-text">{area.label}</span> <span className="pill-action">Change</span>
          </button>
        )}
      </header>

      <div className="tool-grid">
        <div className="globe-wrap">
          <Globe
            center={globeCenter}
            zoom={globeZoom}
            area={area?.polygon ?? null}
            points={globePoints}
            onPick={area ? undefined : (lon, lat) => setPicked({ lon, lat })}
            originY={selected && wide ? 0.3 : 0.5}
            label={area ? `Globe centred on ${area.label}, Brazil highlighted` : 'Globe with Brazil highlighted. Click to choose a point.'}
          />
          {map.kind === 'shown' && selected && (
            <div className="map-caption" role="status">
              <span className="dot" />
              <span className="map-caption-text">
                {MON[selected.month - 1]} {selected.year} · {map.truncated ? `${num(map.returned)} of ${num(map.total)} hotspots` : `${num(map.total)} hotspots`}
              </span>
              <button onClick={clearMap}>Clear</button>
            </div>
          )}
        </div>

        <main className="col">
          {!area ? (
            <LocationGate presets={presets} picked={picked} onPickedChange={setPicked} onDone={chooseArea} />
          ) : (
            <>
              {data?._mock && (
                <p className="demo" role="note">Demo data. The numbers are invented and the same for every area until the real API is connected.</p>
              )}
              {data?.warning && <p className="demo" role="note">{data.warning}</p>}

              {load.kind === 'loading' && <Loading />}
              {load.kind === 'error' && (
                <section className="hero" role="alert">
                  <p className="eyebrow">Something went wrong</p>
                  <h1>We could not load the fire data</h1>
                  <p className="hero-sub">{load.message}</p>
                  <button className="btn btn-light" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
                </section>
              )}
              {data && (
                <>
                  <Hero data={data} area={area} />
                  <div className="replay">
                    <div className="seg" role="radiogroup" aria-label="Reference date">
                      <button role="radio" aria-checked={!replay} className={!replay ? 'on' : ''} onClick={() => setReplay(false)}>Today</button>
                      <button role="radio" aria-checked={replay} className={replay ? 'on' : ''} onClick={() => setReplay(true)}>Replay 14 Sep 2020</button>
                    </div>
                  </div>
                  <div className="sheet">
                    <Upcoming data={data} />
                    {data.calendar.every((c) => !c.count) ? (
                      <section className="empty">
                        <h2>No fires detected here</h2>
                        <p className="muted">The satellites recorded no fire-days in this area since {data.query.start.slice(0, 4)}. Try a larger radius or another region.</p>
                      </section>
                    ) : (
                      <FireCalendar data={data} selected={selected} onSelect={select} />
                    )}
                    <Briefing data={data} />
                  </div>
                </>
              )}
            </>
          )}
        </main>
      </div>

      {selected && <MonthDetail item={selected} map={map} onShowMap={showOnMap} onClose={() => setSelected(null)} />}
    </div>
  );
}

/** The one message that matters, first. Wording only: every number comes from the API. */
function Hero({ data, area }: { data: Analysis; area: Area }) {
  const c = data.cards;
  const month = MONTHS[c.ref_month - 1];
  const p = c.vs_avg_pct;
  const scope = c.partial ? `the first ${c.days_covered} days of ${month}` : month;

  let headline: string;
  if (!c.count) headline = `No fires detected around you in ${scope}`;
  else if (p == null) headline = `${num(c.count)} fire-days around you in ${scope}`;
  else if (p >= 200) headline = `Fire activity around you is ${(p / 100 + 1).toFixed(1)}× the normal level`;
  else if (p >= 20) headline = `Fire activity around you is ${Math.round(p)}% above normal`;
  else if (p <= -20) headline = `Fire activity around you is ${Math.abs(Math.round(p))}% below normal`;
  else headline = 'Fire activity around you is close to normal';

  const provisional = data.calendar.find((i) => i.year === c.ref_year && i.month === c.ref_month)?.provisional;

  return (
    <section className="hero">
      <p className="eyebrow">
        {month} {c.ref_year}{c.partial && ` · first ${c.days_covered} days`} · {area.label}
      </p>
      <h1>{headline}</h1>
      <p className="hero-sub">
        Compared with {scope} in an average year ({data.average_period.from}–{data.average_period.to}).
        An estimate from satellite detections, not a forecast.
      </p>
      <dl className="stats">
        <div><dd>{num(c.count)}</dd><dt>fire-days{c.partial ? ' so far' : ''}</dt></div>
        <div><dd>{c.estimated_fires == null ? '–' : `≈ ${num(c.estimated_fires)}`}</dd><dt>separate fires</dt></div>
        <div><dd>{c.rank == null ? '–' : <>{c.rank}<small> of {c.of_years}</small></>}</dd><dt>rank among {MON[c.ref_month - 1]}s</dt></div>
      </dl>
      <p className="hero-meta">
        {provisional && <span className="tag">Provisional</span>}
        Data updated {dateTime(data.data_updated)}
      </p>
    </section>
  );
}

function Upcoming({ data }: { data: Analysis }) {
  const c = data.cards;
  return (
    <section className="upcoming" aria-labelledby="up-title">
      <div className="upcoming-head">
        <h2 id="up-title">What is normal for the coming months</h2>
        <span className="tag tag-outline">{data.next_months_label}</span>
      </div>
      <ul className="next">
        {data.next_months.map((m) => (
          <li key={`${m.year}-${m.month}`}>
            <span className="next-mon">{MONTHS[m.month - 1]} {m.year}</span>
            <span className="next-val">{num(m.mean)}</span>
            <span className="muted">fire-days on average<br />usually {num(m.p10)}–{num(m.p90)}</span>
          </li>
        ))}
      </ul>
      <p className="muted">
        {c.peak_month != null && <>Fires here usually peak in <strong>{MONTHS[c.peak_month - 1]}</strong>. </>}
        {c.worst_year != null && <>The most active year on record was <strong>{c.worst_year}</strong>.</>}
      </p>
    </section>
  );
}

function Briefing({ data }: { data: Analysis }) {
  const [copied, setCopied] = useState(false);
  const c = data.cards;
  const copy = () => {
    navigator.clipboard?.writeText(data.briefing).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <section className="briefing">
      <h2>Fire briefing</h2>
      <p>{data.briefing}</p>
      <button className="btn btn-ghost" onClick={copy}>{copied ? 'Copied' : 'Copy text'}</button>

      <h3>Hotspots seen by each satellite this month</h3>
      <dl className="sats">
        {(Object.keys(SAT_NAMES) as SatelliteKey[]).map((k) => (
          <div key={k}>
            <dt>{SAT_NAMES[k]}</dt>
            <dd>{c.detected[k] == null ? <span className="muted">no data</span> : num(c.detected[k])}</dd>
          </div>
        ))}
      </dl>
      <h3>How reliable is this?</h3>
      <p className="muted">
        {data.reliability.median_error_pct != null && <>Typical error of the harmonized count: about ±{data.reliability.median_error_pct}%. </>}
        {data.reliability.validated_years.length > 0 && <>Checked against {data.reliability.validated_years.join(', ')}. </>}
        {data.reliability.note}
      </p>
    </section>
  );
}

function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading fire data">
      <section className="hero">
        <div className="sk sk-line" style={{ width: '45%' }} />
        <div className="sk sk-title" />
        <div className="sk sk-title" style={{ width: '70%' }} />
        <div className="sk sk-line" style={{ width: '85%' }} />
      </section>
      <div className="sheet"><div className="sk sk-block" /></div>
    </div>
  );
}

export function Flame() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#ff6a1f" d="M12 2c1 3.500-1.500 5-3 7-1.600 2-2.500 3.700-2.500 6A5.500 5.500 0 0 0 12 20.500 5.500 5.500 0 0 0 17.500 15c0-2-.800-3.300-1.800-4.600-.300 1.300-1 2.200-2 2.600.600-3.500-.200-7.500-1.700-11z" />
      <path fill="#ffd166" d="M12 20.500c-1.700 0-3-1.300-3-3 0-1.500 1-2.500 3-4.500 2 2 3 3 3 4.500 0 1.700-1.300 3-3 3z" />
    </svg>
  );
}
