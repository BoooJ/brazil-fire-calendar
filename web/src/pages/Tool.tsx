import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '../styles.css';
import { ApiError, downloadCsv, getAnalysis, getHotspots, getPresets, getStatus, requestUpdate } from '../api';
import type { Polygon } from 'geojson';
import type { Analysis, AnalysisRequest, CalendarItem, Coverage, Forecast, Hotspots, Preset, Status } from '../types';
import { SATELLITES, SAT_NAMES } from '../types';
import { drawnArea, pointCount, scatterIn, type Area } from '../geo';
import Globe, { BRAZIL_CENTER, zoomForRadius } from '../components/Globe';
import LocationGate, { PinIcon, type Way } from '../components/LocationGate';
import StatusHero from '../components/Status';
import MonthHistory from '../components/MonthHistory';
import { stateArea, type StateFeature } from '../states';
import { LEVEL_WORDS, makeCountLevels } from '../levels';
import FireCalendar, { type Mode } from '../components/FireCalendar';
import MonthDetail, { satNote, type MapState } from '../components/MonthDetail';
import ErrorNote from '../components/ErrorNote';
import ForecastPanel from '../components/ForecastPanel';
import DateControls, { FIRST_YEAR } from '../components/Controls';
import { KeyCards, Reliability, SourcesDialog } from '../components/Panels';
import { Flame } from '../components/Brand';
import type { DrawMode } from '../components/MapView';
import { CHANCE_STOPS, FRP_STOPS } from '../colors';
import { MON, MONTHS, dateRange, num, todayIso } from '../format';

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
/** a touch screen: no Esc or Enter key to talk about */
const touch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
/** 'auto' (jump) when the visitor asked for reduced motion, else 'smooth' */
const scrollMotion = (): ScrollBehavior => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
const message = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

export default function Tool() {
  const today = useMemo(todayIso, []);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [area, setArea] = useState<Area | null>(loadArea);
  const [picked, setPicked] = useState<{ lon: number; lat: number } | null>(null);
  const [way, setWay] = useState<Way>('state');
  const [hoverState, setHoverState] = useState<string | null>(null);
  // a day picked with "Select a day": the calendar scrolls to its month and lights it (nothing is hidden or reloaded)
  const [day, setDay] = useState<string | null>(null);
  const [jump, setJump] = useState<{ year: number; month: number; day?: string; n: number } | null>(null);
  const [fromYear, setFromYear] = useState(FIRST_YEAR);
  const [detailed, setDetailed] = useState(false);
  const [mode, setMode] = useState<Mode>('counts');
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const [map, setMap] = useState<MapState>({ kind: 'idle' });
  const [hotspots, setHotspots] = useState<Hotspots | null>(null);
  const [mapMonth, setMapMonth] = useState<{ year: number; month: number } | null>(null);
  // next week's fire chance cells on the map (the only forecast), instead of a month's hotspots
  const [fcMap, setFcMap] = useState<Forecast | null>(null);
  // the latest next-week estimate for this area (loaded by ForecastPanel): what "Fire cells" puts on the map
  const [forecast, setForecast] = useState<Forecast | null>(null);
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
    };
  }, [area, fromYear]);

  const clearMap = useCallback(() => {
    setMap({ kind: 'idle' });
    setHotspots(null);
    setMapMonth(null);
    setFcMap(null);
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
    setHoverState(null);
    setDrawMode('none');
    clearMap();
    try {
      if (a) localStorage.setItem(STORE, JSON.stringify(a));
      else localStorage.removeItem(STORE);
    } catch {
      /* private mode: fine */
    }
  };

  const chooseAreaRef = useRef(chooseArea);
  chooseAreaRef.current = chooseArea;

  const pickDay = (d: string | null) => {
    setDay(d);
    const items = load.kind === 'ok' ? load.data.calendar : [];
    const cards = load.kind === 'ok' ? load.data.cards : null;
    const [y, m] = d ? d.split('-').map(Number) : [cards?.ref_year ?? 0, cards?.ref_month ?? 0];
    const item = items.find((i) => i.year === y && i.month === m);
    if (!item) {
      if (d) flash('We have no data for that day.');
      return;
    }
    if (detailed) setSelected(item);
    else setJump((j) => ({ year: y, month: m, day: d ?? (load.kind === 'ok' ? load.data.query.ref_date : undefined), n: (j?.n ?? 0) + 1 }));
  };

  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const selectState = useCallback((st: StateFeature) => chooseAreaRef.current(stateArea(st)), []);
  const select = (item: CalendarItem) => {
    setSelected(item);
    if (mapMonth && (mapMonth.year !== item.year || mapMonth.month !== item.month)) clearMap();
  };

  const showOnMap = useCallback((month?: CalendarItem) => {
    const selected = month ?? selectedRef.current;
    if (!area || !selected) return;
    if (month) setSelected(month);
    setMap({ kind: 'loading' });
    getHotspots({ area: area.polygon, year: selected.year, month: selected.month })
      .then((h) => {
        setHotspots(h);
        setFcMap(null);
        setMapMonth({ year: selected.year, month: selected.month });
        setMap({ kind: 'shown', total: h.total, returned: h.returned, truncated: h.truncated });
        setStage('map');
        if (isPhone()) window.scrollTo({ top: 0, behavior: scrollMotion() });
      })
      .catch((e) => setMap({ kind: 'error', message: message(e, 'Could not load the hotspots.') }));
  }, [area]);

  // the hero's link down to the next-week panel: scroll there and move focus to its heading
  const toForecast = useCallback(() => {
    const h = document.getElementById('fc-title');
    if (!h) return;
    h.scrollIntoView({ behavior: scrollMotion(), block: 'start' });
    h.focus({ preventScroll: true });
  }, []);

  const showForecastMap = useCallback((f: Forecast) => {
    setSelected(null);
    setMap({ kind: 'idle' });
    setHotspots(null);
    setMapMonth(null);
    setFcMap(f);
    setStage('map');
    if (isPhone()) window.scrollTo({ top: 0, behavior: scrollMotion() });
  }, []);

  // ---------- the map switch: Standard (globe) · Satellite (imagery) · Fire cells (next week's estimate) ----------
  const view: 'standard' | 'satellite' | 'cells' = stage === 'globe' ? 'standard' : fcMap ? 'cells' : 'satellite';
  const cellsReady = !!forecast && forecast.returned > 0;
  const toStandard = () => {
    setFcMap(null);
    setStage('globe');
  };
  const toSatellite = () => {
    setFcMap(null);
    setStage('map');
  };
  const toCells = () => {
    if (forecast && cellsReady) showForecastMap(forecast);
  };

  // ---------- drawing an area on the map ----------
  const startDraw = (m: DrawMode) => {
    setDrawMode(m);
    setStage(m === 'none' ? 'globe' : 'map');
    if (m !== 'none' && isPhone()) window.scrollTo({ top: 0, behavior: scrollMotion() });
  };
  const drawDone = (polygon: Polygon) => {
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
    () => (area ? points : []),
    [area, points],
  );
  const globePick = useMemo<[number, number] | null>(
    () => (!area && picked && isFinite(picked.lon) && isFinite(picked.lat) ? [picked.lon, picked.lat] : null),
    [area, picked],
  );

  // little animated flames scattered over the chosen area on Standard and Satellite (decoration, random places);
  // off while real hotspots or the fire cells are on show, so they are never mistaken for data
  const flames = useMemo(() => (area ? scatterIn(area.polygon, 12, area.label) : []), [area]);
  const globeFlames = area && stage === 'globe' && !points.length ? flames : undefined;
  const mapFlames = area && view === 'satellite' && !hotspots && drawMode === 'none' ? flames : undefined;

  const data = load.kind === 'ok' ? load.data : null;
  const wide = typeof window !== 'undefined' && window.matchMedia('(min-width: 900px)').matches;
  const closeSources = useCallback(() => setShowSources(false), []);
  const closeDetail = useCallback(() => setSelected(null), []);

  return (
    <div className={'tool' + (stage === 'map' ? ' tool--map' : '')}>
      <header className={'topbar' + (area ? ' topbar--area' : '')}>
        <a className="brand" href="#/">
          <Flame /> <span className="brand-text">Brazil Fire Calendar</span>
        </a>
        <div className="topbar-actions">
          <button className="toplink" onClick={() => setShowSources(true)}>Data sources</button>
          {area && (
            <button className="pill" onClick={() => chooseArea(null)} title="Change location" aria-label={`Location: ${area.label}. Change location`}>
              <PinIcon /> <span className="pill-text">{area.label}</span> <span className="pill-action">Change</span>
            </button>
          )}
        </div>
      </header>

      <div className="tool-grid">
        <div className="globe-wrap" role="region" aria-label="Globe and map">
          <Globe
            center={globeCenter}
            zoom={globeZoom}
            area={area?.polygon ?? null}
            selected={area?.stateId ?? null}
            points={globePoints}
            pick={globePick}
            onPick={!area && way === 'point' ? (lon, lat) => setPicked({ lon, lat }) : undefined}
            onState={area || way === 'state' ? selectState : undefined}
            hover={hoverState}
            onHover={setHoverState}
            originY={selected && wide ? 0.3 : 0.5}
            flames={globeFlames}
            label={area ? `Globe centred on ${area.label}. Click another state to switch to it.` : way === 'point' ? 'Globe of Brazil. Click to choose a point.' : 'Globe of Brazil with its states. Click a state to choose it, or use the list.'}
          />
          {stage === 'map' && (
            <Suspense fallback={null}>
              <div className="stage-map">
                <MapView
                  area={area?.polygon ?? presets.find((p) => p.id === 'brazil')?.area ?? null}
                  hotspots={hotspots}
                  cells={fcMap?.cells ?? null}
                  cellsLabel={fcMap?.label}
                  drawMode={drawMode}
                  onDrawDone={drawDone}
                  onDrawCancel={() => startDraw('none')}
                  onUnavailable={mapUnavailable}
                  onState={selectState}
                  flames={mapFlames}
                />
              </div>
            </Suspense>
          )}
          {drawMode !== 'none' && (
            <div className="map-banner">
              <span role="status">
                {touch
                  ? (drawMode === 'rect' ? 'Drag to draw a box' : 'Tap the corners, then the first again')
                  : `${drawMode === 'rect' ? 'Drag to draw a box' : 'Click the corners, Enter to finish'} · Esc to cancel`}
              </span>
              {/* phones have no Esc key: a visible way out of drawing */}
              <button type="button" className="map-banner-x" onClick={() => startDraw('none')}>Cancel</button>
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
                  <span className="hide-xs">showing </span>{num(map.returned)} of {num(map.total)}
                </span>
              )}
              <button onClick={clearMap} aria-label="Clear the hotspots from the map">Clear</button>
            </div>
          )}
          {/* the globe does not draw forecast cells, so their caption shows only with the map */}
          {fcMap && stage === 'map' && (
            <div className="map-caption" role="status">
              <span className="dot dot-fc" />
              <span className="map-caption-text">Next week</span>
              {fcMap.truncated && (
                <span className="map-badge" title="The cells with the highest chance first.">
                  <span className="hide-xs">showing </span>{num(fcMap.returned)} of {num(fcMap.total)}
                </span>
              )}
              <button onClick={clearMap} aria-label="Clear the fire chance cells from the map">Clear</button>
            </div>
          )}
          {stage === 'map' && fcMap && (
            <div className="map-legend map-legend--fc" aria-label="Map legend: chance of fire next week, per 5 km cell">
              <span>Chance of fire {dateRange(fcMap.period.from, fcMap.period.to)}, per 5&nbsp;km cell</span>
              <span className="map-legend-scale">
              {CHANCE_STOPS.map(([from, colour], i) => (
                <span key={from} className="map-legend-item">
                  <i style={{ background: colour }} />
                  {i === CHANCE_STOPS.length - 1 ? `${from * 100}%+` : `${from * 100}–${CHANCE_STOPS[i + 1][0] * 100}%`}
                </span>
              ))}
              </span>
              <span className="map-legend-label">{fcMap.label}</span>
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
              <span className="map-legend-scale">
              {FRP_STOPS.map(([from, colour], i) => (
                <span key={from} className="map-legend-item">
                  <i style={{ background: colour }} />
                  {i === 0 ? `under ${FRP_STOPS[1][0]}` : i === FRP_STOPS.length - 1 ? `${from}+ MW` : `${from}–${FRP_STOPS[i + 1][0]}`}
                </span>
              ))}
              </span>
            </div>
          )}
          {area && drawMode === 'none' && (
            <div className="stage-switch seg" role="radiogroup" aria-label="Map view">
              <button role="radio" aria-checked={view === 'standard'} className={view === 'standard' ? 'on' : ''} onClick={toStandard}>Standard</button>
              <button role="radio" aria-checked={view === 'satellite'} className={view === 'satellite' ? 'on' : ''} onClick={toSatellite}>Satellite</button>
              {status?.forecast_available !== false && (
                /* aria-disabled, not disabled: it stays focusable and its title says why */
                <button
                  role="radio"
                  aria-checked={view === 'cells'}
                  aria-disabled={!cellsReady}
                  className={(view === 'cells' ? 'on' : '') + (cellsReady ? '' : ' is-off')}
                  onClick={toCells}
                  title={cellsReady ? "Next week's chance of fire, per 5 km cell (model estimate)" : forecast ? 'No cells to show for this area' : "Loading next week's estimate…"}
                >
                  Fire cells
                </button>
              )}
            </div>
          )}
        </div>

        <main className="col">
          {!area ? (
            <LocationGate presets={presets} way={way} onWay={setWay} hoverState={hoverState} onHoverState={setHoverState} picked={picked} onPickedChange={setPicked} onDone={chooseArea} drawMode={drawMode} onDraw={startDraw} onSources={() => setShowSources(true)} />
          ) : (
            <>
              {data?._mock && (
                <p className="demo" role="note">Demo data: the numbers are invented and the same for every area.</p>
              )}
              {data?.warning && <p className="demo" role="note">{data.warning}</p>}

              {load.kind === 'loading' && <LoadingHero />}
              {load.kind === 'error' && (
                <section className="hero">
                  <ErrorNote size="page" title="We could not load the fire data" message={load.message} onRetry={() => setAttempt((n) => n + 1)} />
                </section>
              )}
              {data && <StatusHero data={data} area={area} status={status} updating={updating} onUpdate={updateNow} onForecast={status?.forecast_available === false ? undefined : toForecast} />}
              {data && <MonthHistory data={data} />}
              <DateControls day={day} onDay={pickDay} fromYear={fromYear} setFromYear={setFromYear} detailed={detailed} setDetailed={setDetailed} today={today} />
              {load.kind === 'loading' && (
                <div className="sheet" aria-busy="true" aria-label="Loading fire data"><SheetSkeleton /></div>
              )}
              {data && (
                <>
                  <div className="sheet">
                    {detailed && <KeyCards data={data} />}
                    <div className="view-swap" key={`${detailed ? 'detailed' : 'quick'}|${area.label}|${data.query.ref_date}`}>
                    {data.calendar.every((c) => !c.count) ? (
                      <section className="empty-state">
                        <span className="empty-art" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>
                        <h2>No fires detected here</h2>
                        <p className="muted">The satellites saw no fire in this area since {data.query.start.slice(0, 4)}. That is good news, or the area may be too small to catch any.</p>
                        <button className="btn btn-ghost" onClick={() => chooseArea(null)}>Try a larger radius or another region</button>
                      </section>
                    ) : detailed ? (
                      <Suspense fallback={<section><div className="sk sk-block" aria-busy="true" aria-label="Loading the charts" /></section>}>
                        <Detailed data={data} mode={mode} onMode={setMode} selected={selected} onSelect={select} slug={slug} onCsv={calendarCsv} />
                      </Suspense>
                    ) : (
                      <FireCalendar data={data} selected={selected} onSelect={select} onOpenMap={showOnMap} jump={jump} mode={mode} onMode={setMode} onCsv={calendarCsv} />
                    )}
                    </div>
                    <Upcoming data={data} />
                    <ForecastPanel area={area.polygon} refDate={null} available={status?.forecast_available !== false} refresh={attempt} onLoad={setForecast} />
                    <Briefing data={data} detailed={detailed} coverage={status?.coverage} />
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

      {selected && <MonthDetail item={selected} map={map} onShowMap={() => showOnMap()} onCsv={hotspotsCsv} onClose={closeDetail} coverage={status?.coverage} />}
      {showSources && <SourcesDialog status={status} onClose={closeSources} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

/** The coming months as they usually are (the API's averages), in words and a brick: never numbers without meaning. */
function Upcoming({ data }: { data: Analysis }) {
  const levels = useMemo(() => makeCountLevels(data.calendar), [data.calendar]);
  if (!data.next_months.length) return null;
  return (
    <section className="upcoming" aria-labelledby="up-title">
      <div className="upcoming-head">
        <h2 id="up-title">What the coming months are like</h2>
      </div>
      <ul className="next">
        {data.next_months.map((m) => {
          const lv = levels.level(m.mean);
          return (
            <li key={`${m.year}-${m.month}`}>
              <span className={`day mini typical lv${lv}`} aria-hidden="true" />
              <span className="next-mon">{MONTHS[m.month - 1]} {m.year}</span>
              <span className="next-val">{m.mean == null ? 'No history yet' : LEVEL_WORDS[lv]}</span>
            </li>
          );
        })}
      </ul>
      <p className="quiet-note">{data.next_months_label}.</p>
    </section>
  );
}

function Briefing({ data, detailed, coverage }: { data: Analysis; detailed: boolean; coverage?: Coverage[] }) {
  const c = data.cards;
  return (
    <section className="briefing">
      <h2>In short</h2>
      <p>{data.briefing}</p>

      {detailed ? (
        <>
          <h3>Hotspots seen by each satellite this month</h3>
          <dl className="sats">
            {SATELLITES.map((k) => (
              <div key={k}>
                <dt>{SAT_NAMES[k]}{satNote(coverage, k, c.ref_year, c.ref_month)}</dt>
                <dd>{c.detected[k] == null ? <span className="muted">no data</span> : num(c.detected[k])}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <>
          <h3>Brazil Fire Calendar can make mistakes</h3>
          <p className="muted">
            {data.reliability.median_error_pct != null && <>Our adjusted counts are typically off by about ±{data.reliability.median_error_pct}%. </>}
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
      <div className="sk sk-line" style={{ width: '75%' }} />
      <div className="sk sk-line" style={{ width: '60%' }} />
    </section>
  );
}

/** The sheet's shape while loading: calendar rows, then the coming months, so nothing jumps when data arrives. */
function SheetSkeleton() {
  return (
    <div className="sk-sheet" aria-hidden="true">
      <div className="sk sk-line" style={{ width: '40%', height: 24 }} />
      {[0, 1, 2, 3, 4].map((i) => <div key={i} className="sk sk-calrow" />)}
      <div className="sk sk-line" style={{ width: '60%', height: 24, marginTop: 32 }} />
      <div className="sk-row3">{[0, 1, 2].map((i) => <div key={i} className="sk sk-card" />)}</div>
    </div>
  );
}
