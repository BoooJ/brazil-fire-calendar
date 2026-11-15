import { useRef, useState } from 'react';
import type { Preset } from '../types';
import { circleArea, insideBox, presetArea, type Area } from '../geo';
import { STATES, searchStates, stateArea } from '../states';
import type { DrawMode } from './MapView';

const RADII = [25, 50, 100, 250];
/** The three ways to choose an area. The globe follows: it picks a state, or a point. */
export type Way = 'state' | 'point' | 'draw';

interface Props {
  presets: Preset[];
  way: Way;
  onWay: (w: Way) => void;
  picked: { lon: number; lat: number } | null; // set by a click on the globe
  onPickedChange: (p: { lon: number; lat: number } | null) => void;
  onDone: (a: Area) => void;
  /** the state lit on the globe and in the list (one follows the other) */
  hoverState: string | null;
  onHoverState: (id: string | null) => void;
  /** drawing happens on the map beside this panel: 'none' while the globe is shown */
  drawMode: DrawMode;
  onDraw: (m: DrawMode) => void;
  /** phones and tablets: the top bar has no room for "Data sources", so the step links to it */
  onSources?: () => void;
}

export default function LocationGate({ presets, way, onWay, picked, onPickedChange, onDone, hoverState, onHoverState, drawMode, onDraw, onSources }: Props) {
  const [radius, setRadius] = useState(100);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  // after "Use my location" the result (the button, or the outside-Brazil note) is far below on a phone: bring it into view
  const goRef = useRef<HTMLButtonElement>(null);
  const showResult = () =>
    requestAnimationFrame(() => {
      const b = goRef.current;
      if (!b) return;
      const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      b.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
      if (!b.disabled) b.focus({ preventScroll: true });
    });
  const brazil = presets.find((p) => p.id === 'brazil');
  // ready-made regions that are not a state (a state is picked by its real border, never by a box)
  const stateNames = new Set(STATES.map((s) => s.properties.name.toLowerCase()));
  const regions = presets.filter((p) => !stateNames.has(p.name.toLowerCase()));
  const found = searchStates(query);

  const lat = picked ? String(Math.round(picked.lat * 1000) / 1000) : '';
  const lon = picked ? String(Math.round(picked.lon * 1000) / 1000) : '';

  const setCoord = (which: 'lat' | 'lon', raw: string) => {
    setError(null);
    const v = raw === '' ? NaN : Number(raw);
    const next = { lat: picked?.lat ?? NaN, lon: picked?.lon ?? NaN, [which]: v };
    onPickedChange(isNaN(next.lat) && isNaN(next.lon) ? null : next);
  };

  const valid = picked != null && isFinite(picked.lat) && isFinite(picked.lon);
  const outside = valid && brazil != null && !insideBox(picked!.lon, picked!.lat, brazil.area);

  const locate = () => {
    if (busy) return; // aria-disabled, not disabled: focus stays on the button while we wait
    setError(null);
    if (!navigator.geolocation) {
      setError('This browser cannot share a location. Pick a state or type coordinates instead.');
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        onPickedChange({ lon: pos.coords.longitude, lat: pos.coords.latitude });
        showResult();
      },
      () => {
        setBusy(false);
        setError('We could not get your location. Pick a state or type coordinates instead.');
      },
      { timeout: 10000, maximumAge: 600000 },
    );
  };

  const tabs: [Way, string][] = [['state', 'State'], ['point', 'Point'], ['draw', 'Draw']];
  const switchWay = (w: Way) => {
    if (w !== 'draw' && drawMode !== 'none') onDraw('none');
    onHoverState(null);
    onWay(w);
  };

  return (
    <section className="gate" aria-labelledby="gate-title">
      <p className="eyebrow">Step 1</p>
      <h1 id="gate-title">Where should we look?</h1>
      <p className="gate-lead">Pick a state, a point with a radius, or draw your own area. We cover Brazil.</p>

      <div className="seg gate-ways" role="tablist" aria-label="How to choose the area">
        {tabs.map(([w, name]) => (
          <button key={w} role="tab" id={`way-${w}`} aria-selected={way === w} aria-controls="way-panel" className={way === w ? 'on' : ''} onClick={() => switchWay(w)}>{name}</button>
        ))}
      </div>

      <div id="way-panel" role="tabpanel" aria-labelledby={`way-${way}`} className="gate-panel" key={way}>
        {way === 'state' && (
          <>
            <label className="field">
              <span className="sr-only">Search the 27 states</span>
              <SearchIcon />
              <input type="search" autoComplete="off" placeholder="Search the 27 states" value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && found.length === 1) onDone(stateArea(found[0])); }} />
            </label>
            <ul className="states" aria-label="States of Brazil" onPointerLeave={() => onHoverState(null)}>
              {found.map((s) => (
                <li key={s.properties.id}>
                  <button className={'state' + (hoverState === s.properties.id ? ' is-lit' : '')}
                    onClick={() => onDone(stateArea(s))}
                    onPointerEnter={(e) => e.pointerType === 'mouse' && onHoverState(s.properties.id)}
                    onFocus={() => onHoverState(s.properties.id)} onBlur={() => onHoverState(null)}>
                    <span>{s.properties.name}</span><abbr title={s.properties.name}>{s.properties.id}</abbr>
                  </button>
                </li>
              ))}
              {found.length === 0 && <li className="states-none">No state matches “{query}”.</li>}
            </ul>
            <p className="gate-hint">Or click a state on the globe. The area follows the state’s real border.</p>
            {regions.length > 0 && (
              <>
                <p className="gate-sub">Larger regions</p>
                <div className="chips">
                  {regions.map((p) => <button key={p.id} className="chip" onClick={() => onDone(presetArea(p))}>{p.name}</button>)}
                </div>
              </>
            )}
          </>
        )}

        {way === 'point' && (
          <>
            <button className="btn btn-ghost btn-wide" onClick={locate} aria-disabled={busy || undefined}>
              <PinIcon /> {busy ? 'Finding you…' : 'Use my location'}
            </button>
            {/* right under the button that caused it, so a phone shows it without scrolling */}
            {error && <p className="note note-warn" role="alert">{error}</p>}
            <div className="coords">
              <label>
                Latitude
                <input type="number" step="any" autoComplete="off" enterKeyHint="done" aria-describedby="coords-hint" aria-invalid={outside || undefined} min={-90} max={90} placeholder="-16.83" value={lat}
                  onChange={(e) => setCoord('lat', e.target.value)} />
              </label>
              <label>
                Longitude
                <input type="number" step="any" autoComplete="off" enterKeyHint="done" aria-describedby="coords-hint" aria-invalid={outside || undefined} min={-180} max={180} placeholder="-56.91" value={lon}
                  onChange={(e) => setCoord('lon', e.target.value)} />
              </label>
            </div>
            <p className="gate-hint" id="coords-hint">Click the globe to drop a point, or type decimal degrees (south and west are negative).</p>
            <fieldset className="radius">
              <legend>Radius around the point</legend>
              <div className="seg" role="radiogroup">
                {RADII.map((r) => (
                  <button key={r} role="radio" aria-checked={radius === r} className={radius === r ? 'on' : ''} onClick={() => setRadius(r)}>{r} km</button>
                ))}
              </div>
            </fieldset>
            {outside && <p className="note note-warn" role="alert">That point is outside Brazil, the only country we cover for now.</p>}
            <button ref={goRef} className={'btn btn-fire btn-wide' + (valid && !outside ? ' gate-go--ready' : '')} disabled={!valid || outside}
              onClick={() => onDone(circleArea(picked!.lon, picked!.lat, radius))}>
              {valid ? 'Show my fire calendar' : 'Choose a point first'}
            </button>
            <p className="fineprint">Your location is only used to draw this area. It is never stored on a server.</p>
          </>
        )}

        {way === 'draw' && (
          <>
            <div className="chips">
              <button className={'chip' + (drawMode === 'rect' ? ' on' : '')} aria-pressed={drawMode === 'rect'}
                onClick={() => onDraw(drawMode === 'rect' ? 'none' : 'rect')}>
                <RectIcon /> Rectangle
              </button>
              <button className={'chip' + (drawMode === 'polygon' ? ' on' : '')} aria-pressed={drawMode === 'polygon'}
                onClick={() => onDraw(drawMode === 'polygon' ? 'none' : 'polygon')}>
                <PolyIcon /> Polygon
              </button>
            </div>
            <p className="gate-hint" role="status">
              {drawMode === 'none'
                ? 'Choose a shape, then draw it on the map.'
                : window.matchMedia('(pointer: coarse)').matches
                  ? (drawMode === 'rect'
                    ? 'Drag on the map to draw a box. Cancel is on the map.'
                    : 'Tap the map to add corners. Tap the first corner again to finish. Cancel is on the map.')
                  : drawMode === 'rect'
                    ? 'Drag on the map to draw a box. Press Esc to cancel.'
                    : 'Click the map to add corners. Click the first corner again, double-click or press Enter to finish. Esc cancels.'}
            </p>
          </>
        )}
      </div>

      {onSources && <button className="textlink gate-sources" onClick={onSources}>Data sources</button>}
    </section>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" />
    </svg>
  );
}

export function PinIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function RectIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="6" width="17" height="12" rx="1.5" />
    </svg>
  );
}

function PolyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3.5 20.5 9.6 17.3 19.5H6.7L3.5 9.6z" />
    </svg>
  );
}
