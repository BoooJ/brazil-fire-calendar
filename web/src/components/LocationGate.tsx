import { useState } from 'react';
import type { Preset } from '../types';
import { circleArea, insideBox, presetArea, type Area } from '../geo';
import type { DrawMode } from './MapView';
import { STATES, stateArea } from '../states';

const RADII = [25, 50, 100, 250];

interface Props {
  presets: Preset[];
  picked: { lon: number; lat: number } | null; // set by a click on the globe
  onPickedChange: (p: { lon: number; lat: number } | null) => void;
  onDone: (a: Area) => void;
  /** drawing happens on the map beside this panel: 'none' while the globe is shown */
  drawMode: DrawMode;
  onDraw: (m: DrawMode) => void;
}

export default function LocationGate({ presets, picked, onPickedChange, onDone, drawMode, onDraw }: Props) {
  const [radius, setRadius] = useState(100);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stateCode, setStateCode] = useState('');
  const brazil = presets.find((p) => p.id === 'brazil');

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
    setError(null);
    if (!navigator.geolocation) {
      setError('This browser cannot share a location. Pick a region or type coordinates instead.');
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        onPickedChange({ lon: pos.coords.longitude, lat: pos.coords.latitude });
      },
      () => {
        setBusy(false);
        setError('We could not get your location. Pick a region or type coordinates instead.');
      },
      { timeout: 10000, maximumAge: 600000 },
    );
  };

  return (
    <section className="gate" aria-labelledby="gate-title">
      <p className="eyebrow">Step 1</p>
      <h1 id="gate-title">Where should we look?</h1>
      <p className="gate-lead">
        Everything on this page is about one area. Share your location, tap the globe, pick a region or draw your
        own. We cover Brazil only.
      </p>

      <button className="btn btn-light btn-wide" onClick={locate} disabled={busy}>
        <PinIcon /> {busy ? 'Finding you…' : 'Use my location'}
      </button>

      <div className="gate-or"><span>or pick a region</span></div>
      <div className="chips">
        {presets.map((p) => (
          <button key={p.id} className="chip" onClick={() => onDone(presetArea(p))}>
            {p.name}
          </button>
        ))}
      </div>

      <label className="field">
        Or a state of Brazil
        <select value={stateCode} onChange={(e) => setStateCode(e.target.value)}>
          <option value="" disabled>Choose a state…</option>
          {STATES.map((st) => <option key={st.code} value={st.code}>{st.name} ({st.code})</option>)}
        </select>
      </label>
      <button className="btn btn-quiet btn-wide field-go" disabled={!stateCode}
        onClick={() => {
          const a = stateArea(stateCode);
          if (a) onDone(a);
        }}>
        Show this state
      </button>
      <p className="fineprint field-hint">A state is a simple box around it, so it also covers a little of its neighbours.</p>

      <div className="gate-or"><span>or a point and a radius</span></div>
      <div className="coords">
        <label>
          Latitude
          <input inputMode="decimal" type="number" step="any" min={-90} max={90} placeholder="-16.83" value={lat}
            onChange={(e) => setCoord('lat', e.target.value)} />
        </label>
        <label>
          Longitude
          <input inputMode="decimal" type="number" step="any" min={-180} max={180} placeholder="-56.91" value={lon}
            onChange={(e) => setCoord('lon', e.target.value)} />
        </label>
      </div>
      <fieldset className="radius">
        <legend>Radius around the point</legend>
        <div className="seg" role="radiogroup">
          {RADII.map((r) => (
            <button key={r} role="radio" aria-checked={radius === r} className={radius === r ? 'on' : ''}
              onClick={() => setRadius(r)}>
              {r} km
            </button>
          ))}
        </div>
      </fieldset>

      {outside && (
        <p className="note note-warn" role="alert">
          That point is outside Brazil, the only region we cover for now. Pick a region above or another point.
        </p>
      )}
      {error && <p className="note note-warn" role="alert">{error}</p>}

      <button className="btn btn-fire btn-wide" disabled={!valid || outside}
        onClick={() => onDone(circleArea(picked!.lon, picked!.lat, radius))}>
        Show my fire calendar
      </button>

      <div className="gate-or"><span>or draw the area on the map</span></div>
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
      {drawMode !== 'none' && (
        <p className="note" role="status">
          {drawMode === 'rect'
            ? 'Drag on the map to draw a box. Press Esc to cancel.'
            : 'Click the map to add corners. Click the first corner again, double-click or press Enter to finish. Esc cancels.'}
        </p>
      )}

      <p className="fineprint">Your location is only used to draw this area. It is not stored on a server.</p>
    </section>
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
