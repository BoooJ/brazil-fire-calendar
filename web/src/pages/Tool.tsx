import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '../styles.css';
import { ApiError, downloadCsv, getAnalysis, getHotspots, getPresets, getStatus, requestUpdate } from '../api';
import type { Analysis, AnalysisRequest, CalendarItem, Hotspots, Preset, Status } from '../types';
import { SATELLITES, SAT_NAMES } from '../types';
import { drawnArea, pointCount, type Area } from '../geo';
import Globe, { BRAZIL_CENTER, zoomForRadius } from '../components/Globe';
import LocationGate, { PinIcon } from '../components/LocationGate';
import FireCalendar, { type Mode } from '../components/FireCalendar';
import MonthDetail, { type MapState } from '../components/MonthDetail';
import ErrorNote from '../components/ErrorNote';
import DateControls, { FIRST_YEAR } from '../components/Controls';
import { KeyCards, Reliability, SourcesDialog } from '../components/Panels';
import { Flame } from '../components/Brand';
import type { DrawMode } from '../components/MapView';
import { FRP_STOPS } from '../colors';
import { MON, MONTHS, dateShort, dateTime, num, todayIso } from '../format';

// The two heavy parts load only when they are used: the map (MapLibre) and the detailed charts (ECharts).
const MapView = lazy(() => import('../components/MapView'));
const Detailed = lazy(() => import('../components/Detailed'));

const STORE = 'bfc.area.v1';

function loadArea(): Area | null {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as Area) : null;
  } catch {
    return null;
  }
}

type Load = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ok'; data: Analysis };
/** What the right-hand side shows: the globe, or the map (hotspots of a month, or drawing an area). */
type Stage = 'globe' | 'map';

const isPhone = () => window.matchMedia('(max-width: 899px)').matches;
const message = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

export default function Tool() {
  const today = useMemo(todayIso, []);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [area, setArea] = useState<Area | null>(loadArea);
  const [picked, setPicked] = useState<{ lon: number; lat: number } | null>(null);
  const [refDate, setRefDate] = useState<string | null>(null); // null = today
  const [fromYear, setFromYear] = useState(FIRST_YEAR);
  const [detailed, setDetailed] = useState(false);
  const [mode, setMode] = useState<Mode>('counts');
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const [map, setMap] = useState<MapState>({ kind: 'idle' });
  const [hotspots, setHotspots] = useState<Hotspots | null>(null);
  const [mapMonth, setMapMonth] = useState<{ year: number; month: number } | null>(null);
  const [stage, setStage] = useState<Stage>('globe');
  const [drawMode, setDrawMode] = useState<DrawMode>('none');
  const [showSources, setShowSources] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef(0);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3600);
  }, []);

  useEffect(() => {
    getPresets().then(setPresets).catch(() => setPresets([]));
    getStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  // One request body for the analysis and the calendar download.
  // A past reference date is also the end of the period: the page is shown "as of" that day.
  const request = useMemo<AnalysisRequest | null>(() => {
    if (!area) return null;
    return {
      area: area.polygon,
      ...(fromYear > FIRST_YEAR ? { start: `${fromYear}-01-01` } : {}),
      ...(refDate ? { end: refDate, ref_date: refDate } : {}),
    };
  }, [area, refDate, fromYear]);

  const clearMap = useCallback(() => {
    setMap({ kind: 'idle' });
    setHotspots(null);
    setMapMonth(null);
    setStage('globe');
  }, []);

  useEffect(() => {
    if (!request) return;
    let alive = true;
    setLoad({ kind: 'loading' });
    setSelected(null);
    clearMap();
    getAnalysis(request)
      .then((data) => alive && setLoad({ kind: 'ok', data }))
      .catch((e) => alive && setLoad({ kind: 'error', message: message(e, 'Something went wrong while loading the data.') }));
    return () => {
      alive = false;
    };
  }, [request, attempt, clearMap]);

  const chooseArea = (a: Area | null) => {
    setArea(a);
    setPicked(null);
    setDrawMode('none');
    clearMap();
    try {
      if (a) localStorage.setItem(STORE, JSON.stringify(a));
      else localStorage.removeItem(STORE);
    } catch {
      /* private mode: fine */
    }
  };

  const changeRefDate = (d: string | null) => {
    setRefDate(d);
    // the calendar cannot start after the reference year
    if (d && Number(d.slice(0, 4)) < fromYear) setFromYear(FIRST_YEAR);
  };

  const select = (item: CalendarItem) => {
    setSelected(item);
    if (mapMonth && (mapMonth.year !== item.year || mapMonth.month !== item.month)) clearMap();
  };

  const showOnMap = useCallback(() => {
    if (!area || !selected) return;
    setMap({ kind: 'loading' });
    getHotspots({ area: area.polygon, year: selected.year, month: selected.month })
      .then((h) => {
        setHotspots(h);
        setMapMonth({ year: selected.year, month: selected.month });
        setMap({ kind: 'shown', total: h.total, returned: h.returned, truncated: h.truncated });
        setStage('map');
        if (isPhone()) window.scrollTo({ top: 0, behavior: 'smooth' });
      })
      .catch((e) => setMap({ kind: 'error', message: message(e, 'Could not load the hotspots.') }));
  }, [area, selected]);

  // ---------- drawing an area on the map ----------
  const startDraw = (m: DrawMode) => {
    setDrawMode(m);
    setStage(m === 'none' ? 'globe' : 'map');
    if (m !== 'none' && isPhone()) window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const drawDone = (polygon: Area['polygon']) => {
    if (pointCount(polygon) > 1000) {
      flash('That shape has more than 1,000 points. Try a simpler one.');
      return;
    }
    chooseArea(drawnArea(polygon));
  };
  const mapUnavailable = useCallback(() => {
    // no WebGL: the globe keeps showing the points, as before
    setStage('globe');
    setDrawMode('none');
    flash('This browser cannot show the map. The points stay on the globe.');
  }, [flash]);

  // ---------- downloads and update ----------
  const slug = area?.presetId ?? 'custom-area';
  const calendarCsv = () => {
    if (!request) return;
    downloadCsv('calendar', request, `calendar-${slug}.csv`).catch((e) => flash(message(e, 'The download failed.')));
  };
  const hotspotsCsv = () => {
    if (!area || !selected) return;
    const mm = String(selected.month).padStart(2, '0');
    const lastDay = selected.partial ? selected.days_covered : new Date(selected.year, selected.month, 0).getDate();
    const body: AnalysisRequest = {
      area: area.polygon,
      start: `${selected.year}-${mm}-01`,
      end: `${selected.year}-${mm}-${String(lastDay).padStart(2, '0')}`,
    };
    downloadCsv('hotspots', body, `hotspots-${slug}-${selected.year}-${mm}.csv`)
      .then((capped) => capped && flash('The file was capped at 1,000,000 rows.'))
      .catch((e) => flash(message(e, 'The download failed.')));
  };
  const updateNow = async () => {
    setUpdating(true);
    try {
      const r = await requestUpdate();
      if (r.status === 'updated') {
        setStatus((s) => (s ? { ...s, data_updated: r.data_updated } : s));
        flash(`Updated: ${num(r.new_hotspots)} new hotspots`);
        setAttempt((n) => n + 1);
      } else if (r.status === 'too_soon') flash('Already updated in the last 15 minutes.');
      else flash(r.message ?? 'The update failed. Try again later.');
    } catch (e) {
      flash(message(e, 'The update failed. Try again later.'));
    } finally {
      setUpdating(false);
    }
  };

  // ---------- the globe ----------
  const points = useMemo<[number, number][]>(() => hotspots?.features.map((f) => f.geometry.coordinates) ?? [], [hotspots]);
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
  const closeSources = useCallback(() => setShowSources(false), []);
  const closeDetail = useCallback(() => setSelected(null), []);

  return (
    <div className={'tool' + (stage === 'map' ? ' tool--map' : '')}>
      <header className="topbar">
        <a className="brand" href="#/">
          <Flame /> Brazil Fire Calendar
        </a>
        <div className="topbar-actions">
          <button className="toplink" onClick={() => setShowSources(true)}>Data sources</button>
          {area && (
            <button className="pill" onClick={() => chooseArea(null)} title="Change location">
              <PinIcon /> <span className="pill-text">{area.label}</span> <span className="pill-action">Change</span>
            </button>
          )}
        </div>
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
          {stage === 'map' && (
            <Suspense fallback={null}>
              <div className="stage-map">
                <MapView
                  area={area?.polygon ?? presets.find((p) => p.id === 'brazil')?.area ?? null}
                  hotspots={hotspots}
                  drawMode={drawMode}
                  onDrawDone={drawDone}
                  onDrawCancel={() => startDraw('none')}
                  onUnavailable={mapUnavailable}
                />
              </div>
            </Suspense>
          )}
          {drawMode !== 'none' && (
            <div className="map-banner" role="status">
              {drawMode === 'rect' ? 'Drag to draw a box' : 'Click the corners, Enter to finish'} · Esc to cancel
            </div>
          )}
          {map.kind === 'shown' && mapMonth && (
            <div className="map-caption" role="status">
              <span className="dot" />
              <span className="map-caption-text">
                {map.total === 0
                  ? `No hotspots in ${MON[mapMonth.month - 1]} ${mapMonth.year}`
                  : map.truncated ? `${MON[mapMonth.month - 1]} ${mapMonth.year}` : `${MON[mapMonth.month - 1]} ${mapMonth.year} · ${num(map.total)} hotspots`}
              </span>
              {map.truncated && (
                <span className="map-badge" title="The map shows a sample; the CSV download has every hotspot.">
                  showing {num(map.returned)} of {num(map.total)}
                </span>
              )}
              <button onClick={clearMap}>Clear</button>
            </div>
          )}
          {stage === 'map' && map.kind === 'shown' && map.total === 0 && mapMonth && (
            <div className="map-empty" role="note">
              <strong>No fires detected</strong>
              <span>The satellites saw no hotspots in this area in {MONTHS[mapMonth.month - 1]} {mapMonth.year}.</span>
            </div>
          )}
          {stage === 'map' && map.kind === 'shown' && map.returned > 0 && (
            <div className="map-legend" aria-label="Map legend: fire strength in megawatts">
              <span>Fire strength</span>
              {FRP_STOPS.map(([from, colour], i) => (
                <span key={from} className="map-legend-item">
                  <i style={{ background: colour }} />
                  {i === 0 ? `under ${FRP_STOPS[1][0]}` : i === FRP_STOPS.length - 1 ? `${from}+ MW` : `${from}–${FRP_STOPS[i + 1][0]}`}
                </span>
              ))}
            </div>
          )}
          {area && drawMode === 'none' && (
            <div className="stage-switch seg" role="radiogroup" aria-label="Globe or map">
              <button role="radio" aria-checked={stage === 'globe'} className={stage === 'globe' ? 'on' : ''} onClick={() => setStage('globe')}>Globe</button>
              <button role="radio" aria-checked={stage === 'map'} className={stage === 'map' ? 'on' : ''} onClick={() => setStage('map')}>Map</button>
            </div>
          )}
        </div>

        <main className="col">
          {!area ? (
            <LocationGate presets={presets} picked={picked} onPickedChange={setPicked} onDone={chooseArea} drawMode={drawMode} onDraw={startDraw} />
          ) : (
            <>
              {data?._mock && (
                <p className="demo" role="note">Demo data. The numbers are invented and the same for every area until the real API is connected.</p>
              )}
              {data?.warning && <p className="demo" role="note">{data.warning}</p>}

              {load.kind === 'loading' && <LoadingHero />}
              {load.kind === 'error' && (
                <section className="hero">
                  <ErrorNote size="page" title="We could not load the fire data" message={load.message} onRetry={() => setAttempt((n) => n + 1)} />
                </section>
              )}
              {data && <Hero data={data} area={area} status={status} asOf={refDate} updating={updating} onUpdate={updateNow} />}
              <DateControls refDate={refDate} setRefDate={changeRefDate} fromYear={fromYear} setFromYear={setFromYear}
                detailed={detailed} setDetailed={setDetailed} today={today} />
              {load.kind === 'loading' && (
                <div className="sheet" aria-busy="true" aria-label="Loading fire data"><SheetSkeleton /></div>
              )}
              {data && (
                <>
                  <div className="sheet">
                    {detailed && <KeyCards data={data} />}
                    <Upcoming data={data} />
                    {data.calendar.every((c) => !c.count) ? (
                      <section className="empty-state">
                        <span className="empty-art" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>
                        <h2>No fires detected here</h2>
                        <p className="muted">The satellites recorded no fire-days in this area since {data.query.start.slice(0, 4)}. That is good news, or the area may be too small to catch any.</p>
                        <button className="btn btn-ghost" onClick={() => chooseArea(null)}>Try a larger radius or another region</button>
                      </section>
                    ) : detailed ? (
                      <Suspense fallback={<section><div className="sk sk-block" aria-busy="true" aria-label="Loading the charts" /></section>}>
                        <Detailed data={data} mode={mode} onMode={setMode} selected={selected} onSelect={select} slug={slug} onCsv={calendarCsv} />
                      </Suspense>
                    ) : (
                      <FireCalendar data={data} selected={selected} onSelect={select} mode={mode} onMode={setMode} onCsv={calendarCsv} />
                    )}
                    <Briefing data={data} short={!detailed} />
                    {detailed && <Reliability data={data} status={status} />}
                    <footer className="sheet-foot">
                      <p>Data: NASA FIRMS (MODIS C6.1, VIIRS S-NPP and NOAA-20). Map imagery: NASA GIBS, for display only.</p>
                      <button className="btn btn-ghost" onClick={() => setShowSources(true)}>Data sources</button>
                    </footer>
                  </div>
                </>
              )}
            </>
          )}
        </main>
      </div>

      {selected && <MonthDetail item={selected} map={map} onShowMap={showOnMap} onCsv={hotspotsCsv} onClose={closeDetail} />}
      {showSources && <SourcesDialog status={status} onClose={closeSources} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

/** The one message that matters, first. Wording only: every number comes from the API. */
function Hero({ data, area, status, asOf, updating, onUpdate }: {
  data: Analysis;
  area: Area;
  status: Status | null;
  /** the past day the page is replayed on, null for today */
  asOf: string | null;
  updating: boolean;
  onUpdate: () => void;
}) {
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
        {data.average_period
          ? <>Compared with {scope} in an average year ({data.average_period.from}–{data.average_period.to}). </>
          : <>There is no complete earlier year to compare with. </>}
        An estimate from satellite detections, not a forecast.
      </p>
      <dl className="stats">
        <div><dd>{num(c.count)}</dd><dt>fire-days{c.partial ? ' so far' : ''}</dt></div>
        <div><dd>{c.estimated_fires == null ? '–' : `≈ ${num(c.estimated_fires)}`}</dd><dt>separate fires</dt></div>
        <div><dd>{c.rank == null ? '–' : <>{c.rank}<small> of {c.of_years}</small></>}</dd><dt>rank among {MON[c.ref_month - 1]}s</dt></div>
      </dl>
      <p className="hero-meta">
        {provisional && <span className="tag">Provisional</span>}
        {asOf && <span className="tag">As of {dateShort(data.query.ref_date)}</span>}
        <span>Data updated {dateTime(status?.data_updated ?? data.data_updated)}</span>
        <button className="textlink" onClick={onUpdate} disabled={updating}>{updating ? 'Updating…' : 'Update now'}</button>
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

function Briefing({ data, short }: { data: Analysis; short: boolean }) {
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
        {SATELLITES.map((k) => (
          <div key={k}>
            <dt>{SAT_NAMES[k]}</dt>
            <dd>{c.detected[k] == null ? <span className="muted">no data</span> : num(c.detected[k])}</dd>
          </div>
        ))}
      </dl>
      {short && (
        <>
          <h3>How reliable is this?</h3>
          <p className="muted">
            {data.reliability.median_error_pct != null && <>Typical error of the harmonized count: about ±{data.reliability.median_error_pct}%. </>}
            {data.reliability.validated_years.length > 0 && <>Checked against {data.reliability.validated_years.join(', ')}. </>}
            {data.reliability.note}
          </p>
        </>
      )}
    </section>
  );
}

function LoadingHero() {
  return (
    <section className="hero" aria-busy="true" aria-label="Loading fire data">
      <div className="sk sk-line" style={{ width: '45%' }} />
      <div className="sk sk-title" />
      <div className="sk sk-title" style={{ width: '70%' }} />
      <div className="sk sk-line" style={{ width: '85%' }} />
      <div className="sk sk-stats" />
    </section>
  );
}

/** The sheet's shape while loading: the coming months, then calendar rows, so nothing jumps when data arrives. */
function SheetSkeleton() {
  return (
    <div className="sk-sheet" aria-hidden="true">
      <div className="sk sk-line" style={{ width: '60%', height: 24 }} />
      <div className="sk-row3">{[0, 1, 2].map((i) => <div key={i} className="sk sk-card" />)}</div>
      <div className="sk sk-line" style={{ width: '40%', height: 24, marginTop: 32 }} />
      {[0, 1, 2, 3, 4].map((i) => <div key={i} className="sk sk-calrow" />)}
    </div>
  );
}
