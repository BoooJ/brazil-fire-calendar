import { useState } from 'react';
import type { Preset } from '../types';
import type { DrawMode } from './MapView';

export interface AreaChoice {
  id: string; // preset id, or 'custom'
  label: string;
}

interface Props {
  presets: Preset[];
  areaChoice: AreaChoice;
  onPreset: (p: Preset) => void;
  drawMode: DrawMode;
  setDrawMode: (m: DrawMode) => void;
  onCircle: (lat: number, lon: number, km: number) => void;
  startYear: number;
  endYear: number;
  minYear: number;
  maxYear: number;
  setYears: (s: number, e: number) => void;
  refDate: string;
  setRefDate: (d: string) => void;
  today: string;
}

export function Controls(p: Props) {
  const [lat, setLat] = useState('-18.0');
  const [lon, setLon] = useState('-56.5');
  const [km, setKm] = useState('100');
  const [tab, setTab] = useState<'preset' | 'draw' | 'coords'>('preset');
  const years = Array.from({ length: p.maxYear - p.minYear + 1 }, (_, i) => p.minYear + i);

  const latN = Number(lat), lonN = Number(lon), kmN = Number(km);
  const coordsValid = Number.isFinite(latN) && Number.isFinite(lonN) && Number.isFinite(kmN) && Math.abs(latN) <= 90 && Math.abs(lonN) <= 180 && kmN > 0 && kmN <= 1500;

  return (
    <aside className="controls" aria-label="Choose area and dates">
      <fieldset className="ctl">
        <legend>Area</legend>
        <div className="tabs" role="tablist">
          {(['preset', 'draw', 'coords'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'tab active' : 'tab'} onClick={() => setTab(t)}>
              {t === 'preset' ? 'Presets' : t === 'draw' ? 'Draw' : 'Lat / lon'}
            </button>
          ))}
        </div>

        {tab === 'preset' && (
          <div className="chips">
            {p.presets.map((pr) => (
              <button key={pr.id} className={p.areaChoice.id === pr.id ? 'chip active' : 'chip'} aria-pressed={p.areaChoice.id === pr.id} onClick={() => p.onPreset(pr)}>
                {pr.name}
              </button>
            ))}
          </div>
        )}

        {tab === 'draw' && (
          <div className="draw-tools">
            <div className="chips">
              <button className={p.drawMode === 'rect' ? 'chip active' : 'chip'} onClick={() => p.setDrawMode(p.drawMode === 'rect' ? 'none' : 'rect')}>▭ Rectangle</button>
              <button className={p.drawMode === 'polygon' ? 'chip active' : 'chip'} onClick={() => p.setDrawMode(p.drawMode === 'polygon' ? 'none' : 'polygon')}>⬠ Polygon</button>
            </div>
            <p className="hint">
              {p.drawMode === 'rect' && 'Drag on the map to draw a box. Esc to cancel.'}
              {p.drawMode === 'polygon' && 'Click to add corners. Click the first point, double-click or press Enter to finish.'}
              {p.drawMode === 'none' && 'Pick a tool, then draw on the map.'}
            </p>
          </div>
        )}

        {tab === 'coords' && (
          <form
            className="coords"
            onSubmit={(e) => {
              e.preventDefault();
              if (coordsValid) p.onCircle(latN, lonN, kmN);
            }}
          >
            <label>Lat<input inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} aria-label="Latitude" /></label>
            <label>Lon<input inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} aria-label="Longitude" /></label>
            <label>Radius km<input inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} aria-label="Radius in kilometres" /></label>
            <button className="btn btn-sm" disabled={!coordsValid}>Apply</button>
          </form>
        )}
        <div className="area-now">Showing: <b>{p.areaChoice.label}</b></div>
      </fieldset>

      <fieldset className="ctl">
        <legend>Period</legend>
        <div className="row">
          <label>From
            <select value={p.startYear} onChange={(e) => p.setYears(Number(e.target.value), Math.max(Number(e.target.value), p.endYear))}>
              {years.map((y) => <option key={y}>{y}</option>)}
            </select>
          </label>
          <label>To
            <select value={p.endYear} onChange={(e) => p.setYears(Math.min(p.startYear, Number(e.target.value)), Number(e.target.value))}>
              {years.map((y) => <option key={y}>{y}</option>)}
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset className="ctl">
        <legend>Reference date</legend>
        <input type="date" value={p.refDate} min="2003-01-01" max={p.today} onChange={(e) => e.target.value && p.setRefDate(e.target.value)} aria-label="Reference date (replay a past day)" />
        <div className="chips">
          <button className={p.refDate === p.today ? 'chip active' : 'chip'} onClick={() => p.setRefDate(p.today)}>Today</button>
          <button className={p.refDate === '2020-09-14' ? 'chip active chip-fire' : 'chip chip-fire'} onClick={() => p.setRefDate('2020-09-14')}>🔥 Replay 14 Sep 2020</button>
        </div>
        <p className="hint">See the page as it looked on a past day: cards compare that month with the years before it.</p>
      </fieldset>
    </aside>
  );
}
