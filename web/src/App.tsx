import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, USING_MOCKS, downloadCsv, fetchAnalysis, fetchHotspots, fetchPresets, fetchStatus, requestUpdate } from './api';
import type { Analysis, Area, Hotspots, Preset, Query, Status } from './types';
import { circleToPolygon, pointCount } from './geo';
import { fmt, fmtDateTime, monthName, todayIso } from './format';
import { BurningCalendar, CalendarLegend, type CalendarMode } from './components/BurningCalendar';
import { MapView, type DrawMode } from './components/MapView';
import { TypicalYearChart, YearlyChart } from './components/Charts';
import type { EChartHandle } from './components/EChart';
import { Briefing, KeyCards, NextMonths, Reliability, SourcesDialog } from './components/Panels';
import { Controls, type AreaChoice } from './components/Controls';

const FIRST_YEAR = 2003;

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

function savePng(handle: EChartHandle | null, name: string) {
  const url = handle?.toPng();
  if (!url) return;
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
}

export default function App() {
  const today = todayIso();
  const compact = useCompact();

  const [presets, setPresets] = useState<Preset[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [area, setArea] = useState<Area | null>(null);
  const [areaChoice, setAreaChoice] = useState<AreaChoice>({ id: 'pantanal', label: 'Pantanal' });
  const [startYear, setStartYear] = useState(FIRST_YEAR);
  const [endYear, setEndYear] = useState(Number(today.slice(0, 4)));
  const [refDate, setRefDateRaw] = useState(today);

  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<CalendarMode>('counts');
  const [selected, setSelected] = useState<{ year: number; month: number } | null>(null);
  const [hotspots, setHotspots] = useState<Hotspots | null>(null);
  const [hsLoading, setHsLoading] = useState(false);
  const [hsError, setHsError] = useState<string | null>(null);

  const [detailed, setDetailed] = useState(false);
  const [drawMode, setDrawMode] = useState<DrawMode>('none');
  const [showSources, setShowSources] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const calRef = useRef<EChartHandle>(null);
  const typRef = useRef<EChartHandle>(null);
  const yrRef = useRef<EChartHandle>(null);
  const mapSection = useRef<HTMLElement>(null);

  const refYear = Number(refDate.slice(0, 4));
  const setRefDate = (d: string) => {
    setRefDateRaw(d);
    const y = Number(d.slice(0, 4));
    setEndYear(y);
    setStartYear((s) => Math.min(s, y));
  };

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  };

  // ---------- boot ----------
  useEffect(() => {
    fetchStatus().then(setStatus).catch(() => {});
    fetchPresets()
      .then((ps) => {
        setPresets(ps);
        const p = ps.find((x) => x.id === 'pantanal') ?? ps[0];
        if (p) {
          setArea(p.area);
          setAreaChoice({ id: p.id, label: p.name });
        }
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const query = useMemo<Query | null>(() => {
    if (!area) return null;
    const endDate = `${endYear}-12-31` < refDate ? `${endYear}-12-31` : refDate;
    return { area, start: `${startYear}-01-01`, end: endDate, ref_date: refDate };
  }, [area, startYear, endYear, refDate]);

  // ---------- analysis ----------
  useEffect(() => {
    if (!query) return;
    let alive = true;
    setLoading(true);
    setError(null);
    fetchAnalysis(query)
      .then((a) => {
        if (!alive) return;
        setAnalysis(a);
        setSelected({ year: a.cards.ref_year, month: a.cards.ref_month });
      })
      .catch((e: Error) => alive && setError(e instanceof ApiError ? `${e.message}` : 'Something went wrong.'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [query]);

  // ---------- hotspots for the selected month ----------
  useEffect(() => {
    if (!area || !selected) return;
    let alive = true;
    setHsLoading(true);
    setHsError(null);
    fetchHotspots(area, selected.year, selected.month)
      .then((h) => alive && setHotspots(h))
      .catch((e: Error) => alive && setHsError(e.message))
      .finally(() => alive && setHsLoading(false));
    return () => {
      alive = false;
    };
  }, [area, selected]);

  const onSelect = useCallback(
    (year: number, month: number) => {
      setSelected({ year, month });
      if (compact) mapSection.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    [compact],
  );

  const setCustomArea = (a: Area, label: string) => {
    if (pointCount(a) > 1000) return flash('That shape has more than 1,000 points. Try a simpler one.');
    setArea(a);
    setAreaChoice({ id: 'custom', label });
  };

  const maxCount = analysis ? Math.max(1, ...analysis.calendar.map((c) => c.count)) : 1;
  const selCell = analysis && selected ? analysis.calendar.find((c) => c.year === selected.year && c.month === selected.month) : undefined;
  const period = analysis ? `${analysis.average_period.from}–${analysis.average_period.to}` : '';
  const slug = areaChoice.id === 'custom' ? 'custom-area' : areaChoice.id;

  return (
    <div className="app">
      <header className="top">
        <a className="brand" href="./" aria-label="Brazil Fire Calendar: about the project">
          <div className="logo" aria-hidden>
            <span />
          </div>
          <div>
            <h1>Brazil Fire Calendar</h1>
            <p className="tagline">20+ years of NASA fire hotspots, one consistent scale — MODIS and VIIRS harmonized.</p>
          </div>
        </a>
        <div className="top-actions">
          {USING_MOCKS && <span className="badge badge-mock" title="VITE_API_BASE_URL is empty, so the site reads web/mocks/. All numbers are invented.">Mock data</span>}
          <div className="updated">
            <span className="muted">Data updated</span>
            <b>{status ? fmtDateTime(status.data_updated) : '…'}</b>
          </div>
          <button
            className="btn btn-sm"
            disabled={updating}
            onClick={async () => {
              setUpdating(true);
              try {
                const r = await requestUpdate();
                if (r.status === 'updated') {
                  setStatus((s) => (s ? { ...s, data_updated: r.data_updated } : s));
                  flash(`Updated · ${fmt(r.new_hotspots)} new hotspots`);
                } else if (r.status === 'too_soon') flash('Already updated in the last 15 minutes.');
                else flash('Update failed. Try again later.');
              } catch (e) {
                flash((e as Error).message);
              } finally {
                setUpdating(false);
              }
            }}
          >
            {updating ? 'Updating…' : '↻ Update now'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowSources(true)}>Data sources</button>
        </div>
      </header>

      <div className="layout">
        <Controls
          presets={presets}
          areaChoice={areaChoice}
          onPreset={(p) => {
            setDrawMode('none');
            setArea(p.area);
            setAreaChoice({ id: p.id, label: p.name });
          }}
          drawMode={drawMode}
          setDrawMode={(m) => {
            setDrawMode(m);
            if (m !== 'none') mapSection.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
          onCircle={(lat, lon, km) => setCustomArea(circleToPolygon(lat, lon, km), `${km} km around ${lat.toFixed(2)}, ${lon.toFixed(2)}`)}
          startYear={startYear}
          endYear={endYear}
          minYear={FIRST_YEAR}
          maxYear={refYear}
          setYears={(s, e) => {
            setStartYear(s);
            setEndYear(e);
          }}
          refDate={refDate}
          setRefDate={setRefDate}
          today={today}
        />

        <main className="content">
          <div className="view-switch" role="group" aria-label="View">
            <button className={!detailed ? 'seg active' : 'seg'} aria-pressed={!detailed} onClick={() => setDetailed(false)}>Quick view</button>
            <button className={detailed ? 'seg active' : 'seg'} aria-pressed={detailed} onClick={() => setDetailed(true)}>Detailed view</button>
          </div>

          {error && (
            <div className="state state-error" role="alert">
              <b>Couldn't load the data.</b> {error}
              <button className="btn btn-sm" onClick={() => setArea((a) => (a ? { ...a } : a))}>Retry</button>
            </div>
          )}
          {USING_MOCKS && areaChoice.id !== 'pantanal' && (
            <div className="state state-info">Mock mode: every area shows the Pantanal sample. The real API will return numbers for <b>{areaChoice.label}</b>.</div>
          )}
          {analysis?.warning && <div className="state state-info">{analysis.warning}</div>}

          {!analysis && !error && <Skeleton />}

          {analysis && (
            <div className={loading ? 'dim' : ''} aria-busy={loading}>
              <KeyCards a={analysis} detailed={detailed} />
              {analysis.cards.count === 0 && <div className="state state-info">No fires detected in this area for {monthName(analysis.cards.ref_month)} {analysis.cards.ref_year}.</div>}
              <Briefing text={analysis.briefing} />

              <section className="panel calendar-panel">
                <div className="panel-head">
                  <div>
                    <h2>Burning calendar</h2>
                    <p className="muted">{areaChoice.label} · {fmt(analysis.query.area_km2)} km² · click a month to see its fires on the map</p>
                  </div>
                  <div className="panel-tools">
                    <div className="seg-group" role="group" aria-label="Calendar mode">
                      <button className={mode === 'counts' ? 'seg active' : 'seg'} aria-pressed={mode === 'counts'} onClick={() => setMode('counts')}>Counts</button>
                      <button className={mode === 'anomaly' ? 'seg active' : 'seg'} aria-pressed={mode === 'anomaly'} onClick={() => setMode('anomaly')}>vs Average</button>
                    </div>
                    <div className="dl">
                      <button className="btn btn-ghost btn-sm" onClick={() => savePng(calRef.current, `burning-calendar-${slug}-${mode}.png`)}>PNG</button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => query && downloadCsv('calendar', query, `calendar-${slug}.csv`).catch((e) => flash(e.message))}
                      >
                        CSV
                      </button>
                    </div>
                  </div>
                </div>
                <div className="calendar-scroll">
                  <BurningCalendar
                    ref={calRef}
                    calendar={analysis.calendar}
                    average={analysis.average_by_month}
                    yearly={analysis.yearly}
                    mode={mode}
                    selected={selected}
                    onSelect={onSelect}
                    compact={compact}
                    unitMain={analysis.unit.main}
                  />
                </div>
                <CalendarLegend mode={mode} maxCount={maxCount} />
              </section>

              <section className="panel map-panel" ref={mapSection}>
                <div className="panel-head">
                  <div>
                    <h2>Fire map {selected && <span className="accent">· {monthName(selected.month)} {selected.year}</span>}</h2>
                    <p className="muted">
                      {hsLoading && 'Loading hotspots…'}
                      {!hsLoading && hotspots && (hotspots.truncated
                        ? <>Showing <b>{fmt(hotspots.returned)}</b> of <b>{fmt(hotspots.total)}</b> hotspots (sample)</>
                        : <><b>{fmt(hotspots.total)}</b> hotspots</>)}
                      {!hsLoading && hotspots?.total === 0 && ' — no fires this month'}
                      {selCell && <> · {fmt(selCell.count)} fire-days</>}
                      {USING_MOCKS && <span className="muted"> · mock: always Sep 2020</span>}
                    </p>
                  </div>
                  <div className="dl">
                    <button className="btn btn-ghost btn-sm" onClick={() => query && downloadCsv('hotspots', query, `hotspots-${slug}.csv`).then((t) => t && flash('File capped at 1,000,000 rows.')).catch((e) => flash(e.message))}>
                      Hotspots CSV
                    </button>
                  </div>
                </div>
                {hsError && <div className="state state-error">{hsError}</div>}
                <div className="map-wrap">
                  <MapView
                    area={area}
                    hotspots={hotspots}
                    drawMode={drawMode}
                    onDrawDone={(poly) => {
                      setDrawMode('none');
                      setCustomArea(poly, 'Drawn area');
                    }}
                    onDrawCancel={() => setDrawMode('none')}
                  />
                  {drawMode !== 'none' && <div className="map-banner">{drawMode === 'rect' ? 'Drag to draw a box' : 'Click corners · Enter to finish'} · Esc to cancel</div>}
                  <div className="map-legend" aria-label="Map legend">
                    <span>Fire strength</span>
                    <i style={{ background: '#f9cb35' }} />&lt;10
                    <i style={{ background: '#f98e09' }} />10–50
                    <i style={{ background: '#e45a31' }} />50–150
                    <i style={{ background: '#bc3754' }} />150+ MW
                  </div>
                </div>
              </section>

              <div className="grid-2">
                <NextMonths a={analysis} />
                {detailed ? <Reliability a={analysis} status={status} /> : (
                  <section className="panel teaser">
                    <h2>Why "corrected"?</h2>
                    <p>Newer satellites see smaller fires, so raw counts jump whenever one is launched. We convert every satellite to one common scale, so the calendar shows real change, not new hardware.</p>
                    <button className="btn btn-sm" onClick={() => setDetailed(true)}>Show the details →</button>
                  </section>
                )}
              </div>

              {detailed && (
                <>
                  <section className="panel">
                    <div className="panel-head">
                      <div>
                        <h2>Typical year</h2>
                        <p className="muted">Usual monthly range ({period}) vs {refYear}</p>
                      </div>
                      <button className="btn btn-ghost btn-sm" onClick={() => savePng(typRef.current, `typical-year-${slug}.png`)}>PNG</button>
                    </div>
                    <TypicalYearChart ref={typRef} average={analysis.average_by_month} calendar={analysis.calendar} refYear={refYear} period={period} />
                  </section>
                  <section className="panel">
                    <div className="panel-head">
                      <div>
                        <h2>Year by year: raw vs corrected</h2>
                        <p className="muted">Bars jump when VIIRS arrives (2012, 2018). The corrected line doesn't.</p>
                      </div>
                      <button className="btn btn-ghost btn-sm" onClick={() => savePng(yrRef.current, `year-by-year-${slug}.png`)}>PNG</button>
                    </div>
                    <YearlyChart ref={yrRef} yearly={analysis.yearly} unitMain={analysis.unit.main} />
                  </section>
                </>
              )}
            </div>
          )}

          <footer className="foot">
            Data: NASA FIRMS (MODIS C6.1, VIIRS S-NPP / NOAA-20) · Map imagery: NASA GIBS · NASA Space Apps Challenge 2026
            {status && <> · API contract v{status.contract_version}</>}
          </footer>
        </main>
      </div>

      {showSources && <SourcesDialog status={status} onClose={() => setShowSources(false)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="skeleton" aria-busy="true" aria-label="Loading">
      <div className="sk-row">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="sk sk-card" />)}</div>
      <div className="sk sk-text" />
      <div className="sk sk-block" />
    </div>
  );
}
