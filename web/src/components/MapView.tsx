// The fire map: hotspots of one month on NASA imagery, and the tool to draw an area (rectangle or polygon).
// It sits in the same place as the globe and takes over when there are points to show or an area to draw.
import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection, Point, Polygon } from 'geojson';
import type { AreaGeometry, Forecast, Hotspots, SatelliteKey } from '../types';
import { SAT_NAMES } from '../types';
import { CHANCE_STOPS, FRP_STOPS } from '../colors';
import { areaBbox, closeRing, rectPolygon } from '../geo';
import { timeUtc } from '../format';
import { loadWorld } from './Globe';

export type DrawMode = 'none' | 'rect' | 'polygon';

interface Props {
  area: AreaGeometry | null;
  hotspots: Hotspots | null;
  /** next-week fire chance cells (POST /api/forecast), shown instead of hotspots */
  cells?: Forecast['cells'] | null;
  /** the forecast's label, repeated in its popups */
  cellsLabel?: string;
  drawMode: DrawMode;
  onDrawDone: (p: Polygon) => void;
  onDrawCancel: () => void;
  /** the browser cannot draw the map (no WebGL): the caller falls back to the globe */
  onUnavailable?: () => void;
}

// Basemap: NASA GIBS (Blue Marble shaded relief) — imagery only, never used for the numbers.
const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    bluemarble: {
      type: 'raster',
      // KVP form: works without a TIME value for this static layer.
      tiles: [
        `${GIBS}/wmts.cgi?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=BlueMarble_ShadedRelief_Bathymetry&STYLE=default` +
          `&TILEMATRIXSET=GoogleMapsCompatible_Level8&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg`,
      ],
      tileSize: 256,
      maxzoom: 8,
      attribution: 'Imagery: NASA GIBS / Blue Marble',
    },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#04050b' } },
    { id: 'bluemarble', type: 'raster', source: 'bluemarble', paint: { 'raster-brightness-max': 0.55, 'raster-saturation': -0.45, 'raster-contrast': 0.1 } },
  ],
};

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export default function MapView({ area, hotspots, cells = null, cellsLabel = '', drawMode, onDrawDone, onDrawCancel, onUnavailable }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const pending = useRef<{ area: AreaGeometry | null; hotspots: Hotspots | null; cells: Forecast['cells'] | null }>({ area, hotspots, cells });
  const fcLabel = useRef(cellsLabel);
  fcLabel.current = cellsLabel;
  const draw = useRef({ mode: drawMode, start: null as maplibregl.LngLat | null, pts: [] as [number, number][] });
  const cb = useRef({ onDrawDone, onDrawCancel, onUnavailable });
  cb.current = { onDrawDone, onDrawCancel, onUnavailable };
  // the NASA GIBS imagery could not load (offline, blocked): say so instead of a silent black map
  const [noImagery, setNoImagery] = useState(false);

  // ---------- init ----------
  useEffect(() => {
    if (!el.current) return;
    let m: maplibregl.Map;
    try {
      m = new maplibregl.Map({
        container: el.current,
        style: STYLE,
        center: [-54, -14],
        zoom: 3.3,
        minZoom: 2,
        maxZoom: 11,
        attributionControl: false,
        // on a phone the map lies at the top of a page that scrolls: one finger scrolls the page, two move the map
        cooperativeGestures: window.matchMedia('(max-width: 899px)').matches,
      });
    } catch {
      cb.current.onUnavailable?.();
      return;
    }
    map.current = m;
    // bottom left: the top holds the caption and the legend, the bottom right the month's details
    m.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-left');

    let imageryErrors = 0;
    let imageryLoaded = false;
    m.on('error', (e: any) => {
      if (e?.sourceId !== 'bluemarble' || imageryLoaded) return;
      if (++imageryErrors >= 3) setNoImagery(true);
    });
    m.on('sourcedata', (e: any) => {
      if (e?.sourceId === 'bluemarble' && e.tile && e.tile.state === 'loaded') {
        imageryLoaded = true;
        setNoImagery(false);
      }
    });

    // 'style.load' fires once the style is parsed, without waiting for basemap tiles.
    const init = () => {
      if (ready.current || m.getSource('area')) return;
      m.addSource('area', { type: 'geojson', data: EMPTY });
      m.addLayer({ id: 'area-fill', type: 'fill', source: 'area', paint: { 'fill-color': '#ff6a1f', 'fill-opacity': 0.06 } });
      m.addLayer({ id: 'area-line', type: 'line', source: 'area', paint: { 'line-color': '#ff6a1f', 'line-width': 2 } });

      // forecast cells (5 km): a dot about one cell wide at every zoom, coloured by the model's chance
      m.addSource('fc', { type: 'geojson', data: EMPTY });
      m.addLayer({
        id: 'fc', type: 'circle', source: 'fc',
        paint: {
          'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 5, 2.2, 9, 17, 11, 68],
          'circle-color': ['interpolate', ['linear'], ['get', 'probability'], ...CHANCE_STOPS.flat()] as any,
          'circle-opacity': 0.85,
          'circle-stroke-color': '#04050b', 'circle-stroke-width': 0.4,
        },
      });

      m.addSource('hotspots', { type: 'geojson', data: EMPTY });
      m.addLayer({
        id: 'hotspots-glow', type: 'circle', source: 'hotspots',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 5, 8, 14],
          'circle-color': '#f98e09', 'circle-opacity': 0.16, 'circle-blur': 1,
        },
      });
      m.addLayer({
        id: 'hotspots', type: 'circle', source: 'hotspots',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 2.2, 8, 6],
          // fire strength (FRP, MW); a hotspot without a value takes the lowest colour
          'circle-color': ['interpolate', ['linear'], ['coalesce', ['get', 'frp'], 0], ...FRP_STOPS.flat()] as any,
          'circle-stroke-color': '#04050b', 'circle-stroke-width': 0.6,
          'circle-opacity': ['case', ['get', 'provisional'], 0.65, 0.95],
        },
      });

      m.addSource('draft', { type: 'geojson', data: EMPTY });
      m.addLayer({ id: 'draft-fill', type: 'fill', source: 'draft', paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.08 } });
      m.addLayer({ id: 'draft-line', type: 'line', source: 'draft', paint: { 'line-color': '#ffffff', 'line-width': 1.5 } });
      m.addLayer({ id: 'draft-pts', type: 'circle', source: 'draft', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 4, 'circle-color': '#fff' } });

      const popup = new maplibregl.Popup({ closeButton: false, className: 'hs-popup', offset: 10, maxWidth: '260px' });
      const show = (e: maplibregl.MapLayerMouseEvent) => {
        if (draw.current.mode !== 'none') return;
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as Record<string, unknown>;
        popup
          .setLngLat((f.geometry as Point).coordinates as [number, number])
          .setHTML(
            `<b class="pt-title">${esc(p.date)} · ${esc(timeUtc(String(p.time_utc ?? '')))}</b>` +
              `<span class="pt-big">${p.frp == null ? 'strength not measured' : `${esc(p.frp)} <small>MW fire strength</small>`}</span>` +
              `<span>${esc(SAT_NAMES[p.satellite as SatelliteKey] ?? p.satellite)} · ${p.daynight === 'D' ? 'day' : 'night'} pass</span>` +
              `<span>Confidence ${esc(p.confidence)}</span>` +
              (p.provisional ? '<span class="pt-flag">Provisional (near-real-time data)</span>' : ''),
          )
          .addTo(m);
      };
      m.on('mouseenter', 'hotspots', () => (m.getCanvas().style.cursor = 'pointer'));
      m.on('mouseleave', 'hotspots', () => {
        m.getCanvas().style.cursor = draw.current.mode === 'none' ? '' : 'crosshair';
        popup.remove();
      });
      m.on('mousemove', 'hotspots', show);
      m.on('click', 'hotspots', show); // touch screens have no hover

      const showCell = (e: maplibregl.MapLayerMouseEvent) => {
        if (draw.current.mode !== 'none') return;
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as Record<string, unknown>;
        const chance = Number(p.probability);
        const strength = p.intensity_if_fire == null || p.intensity_if_fire === 'null' ? null : String(p.intensity_if_fire);
        popup
          .setLngLat((f.geometry as Point).coordinates as [number, number])
          .setHTML(
            `<b class="pt-title">Next week · this 5&nbsp;km cell</b>` +
              `<span class="pt-big">${isFinite(chance) ? Math.round(chance * 100) : '–'}% <small>chance of fire</small></span>` +
              (strength ? `<span>Likely strength if it burns: ${esc(strength)}</span>` : '') +
              `<span class="pt-flag">${esc(fcLabel.current)}</span>`,
          )
          .addTo(m);
      };
      m.on('mouseenter', 'fc', () => (m.getCanvas().style.cursor = 'pointer'));
      m.on('mouseleave', 'fc', () => {
        m.getCanvas().style.cursor = draw.current.mode === 'none' ? '' : 'crosshair';
        popup.remove();
      });
      m.on('mousemove', 'fc', showCell);
      m.on('click', 'fc', showCell);

      ready.current = true;
      apply(pending.current.area, pending.current.hotspots, pending.current.cells, true);
    };
    m.once('style.load', init);
    m.once('load', init);

    // ---------- drawing ----------
    const setDraft = (fc: FeatureCollection) => (m.getSource('draft') as maplibregl.GeoJSONSource | undefined)?.setData(fc);
    const rectFc = (a: maplibregl.LngLat, b: maplibregl.LngLat): FeatureCollection => ({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: rectPolygon(a.lng, a.lat, b.lng, b.lat) }],
    });
    const polyFc = (pts: [number, number][], cursor?: [number, number]): FeatureCollection => {
      const line = cursor ? [...pts, cursor] : pts;
      return {
        type: 'FeatureCollection',
        features: [
          ...(line.length >= 2 ? [{ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: line } }] : []),
          ...pts.map((c) => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: c } })),
        ],
      };
    };

    const down = (e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent) => {
      if (draw.current.mode !== 'rect') return;
      e.preventDefault();
      draw.current.start = e.lngLat;
    };
    const move = (e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent) => {
      const d = draw.current;
      if (d.mode === 'rect' && d.start) setDraft(rectFc(d.start, e.lngLat));
      if (d.mode === 'polygon' && d.pts.length) setDraft(polyFc(d.pts, [e.lngLat.lng, e.lngLat.lat]));
    };
    const up = (e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent) => {
      const d = draw.current;
      if (d.mode !== 'rect' || !d.start) return;
      const a = d.start;
      const b = e.lngLat;
      d.start = null;
      setDraft(EMPTY);
      if (Math.abs(a.lng - b.lng) < 0.05 || Math.abs(a.lat - b.lat) < 0.05) return; // a tap, not a box
      cb.current.onDrawDone(rectPolygon(a.lng, a.lat, b.lng, b.lat));
    };
    const finishPoly = () => {
      const d = draw.current;
      if (d.pts.length >= 3) cb.current.onDrawDone(closeRing(d.pts));
      d.pts = [];
      setDraft(EMPTY);
    };
    const click = (e: maplibregl.MapMouseEvent) => {
      const d = draw.current;
      if (d.mode !== 'polygon') return;
      const pt: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      if (d.pts.length >= 3) {
        const first = m.project(d.pts[0]);
        if (Math.hypot(first.x - e.point.x, first.y - e.point.y) < 14) return finishPoly();
      }
      d.pts.push(pt);
      setDraft(polyFc(d.pts));
    };
    const dbl = (e: maplibregl.MapMouseEvent) => {
      if (draw.current.mode !== 'polygon') return;
      e.preventDefault();
      finishPoly();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && draw.current.mode !== 'none') {
        draw.current.pts = [];
        draw.current.start = null;
        setDraft(EMPTY);
        cb.current.onDrawCancel();
      }
      if (e.key === 'Enter' && draw.current.mode === 'polygon') finishPoly();
    };

    m.on('mousedown', down);
    m.on('touchstart', down);
    m.on('mousemove', move);
    m.on('touchmove', move);
    m.on('mouseup', up);
    m.on('touchend', up);
    m.on('click', click);
    m.on('dblclick', dbl);
    window.addEventListener('keydown', key);

    return () => {
      window.removeEventListener('keydown', key);
      m.remove();
      map.current = null;
      ready.current = false;
    };
  }, []);

  // ---------- no imagery: the globe's country outlines as a plain ground (display only), so the map is never blind ----------
  useEffect(() => {
    const m = map.current;
    if (!noImagery || !m) return;
    let alive = true;
    loadWorld().then((w) => {
      if (!alive || !map.current || m.getSource('fallback-world')) return;
      const add = () => {
        if (m.getSource('fallback-world')) return;
        m.addSource('fallback-world', { type: 'geojson', data: w.others as FeatureCollection });
        m.addSource('fallback-brazil', { type: 'geojson', data: w.brazil as FeatureCollection });
        const before = m.getLayer('area-fill') ? 'area-fill' : undefined;
        m.addLayer({ id: 'fallback-world', type: 'fill', source: 'fallback-world', paint: { 'fill-color': '#0a0d55' } }, before);
        m.addLayer({ id: 'fallback-world-line', type: 'line', source: 'fallback-world', paint: { 'line-color': '#01020a', 'line-width': 0.8 } }, before);
        m.addLayer({ id: 'fallback-brazil', type: 'fill', source: 'fallback-brazil', paint: { 'fill-color': '#3a3f55' } }, before);
      };
      // 'ready' (our layers exist) rather than isStyleLoaded(): that one stays false while imagery tiles keep failing
      if (ready.current) add();
      else m.once('style.load', add);
    });
    return () => {
      alive = false;
    };
  }, [noImagery]);

  // ---------- draw mode toggling ----------
  useEffect(() => {
    const m = map.current;
    draw.current.mode = drawMode;
    draw.current.pts = [];
    draw.current.start = null;
    if (!m) return;
    (m.getSource('draft') as maplibregl.GeoJSONSource | undefined)?.setData(EMPTY);
    const drawing = drawMode !== 'none';
    m.getCanvas().style.cursor = drawing ? 'crosshair' : '';
    // while a box is dragged, neither the map nor the page may move under the finger
    m.getCanvasContainer().style.touchAction = drawMode === 'rect' ? 'none' : '';
    if (drawMode === 'rect') m.dragPan.disable();
    else m.dragPan.enable();
    if (drawing) m.doubleClickZoom.disable();
    else m.doubleClickZoom.enable();
  }, [drawMode]);

  // ---------- data ----------
  const lastAreaKey = useRef('');
  function apply(a: AreaGeometry | null, h: Hotspots | null, c: Forecast['cells'] | null, first = false) {
    const m = map.current;
    if (!m || !ready.current) return;
    (m.getSource('area') as maplibregl.GeoJSONSource).setData(
      a ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: a }] } : EMPTY,
    );
    (m.getSource('hotspots') as maplibregl.GeoJSONSource).setData((h as unknown as FeatureCollection) ?? EMPTY);
    (m.getSource('fc') as maplibregl.GeoJSONSource).setData((c as unknown as FeatureCollection) ?? EMPTY);
    const key = a ? JSON.stringify(a.coordinates).slice(0, 200) : '';
    if (a && key !== lastAreaKey.current) {
      lastAreaKey.current = key;
      const [w, s, e, n] = areaBbox(a);
      // room for the top bar, the caption and the legend above the area
      const phone = m.getContainer().clientHeight < 520;
      const padding = phone ? { top: 150, bottom: 28, left: 28, right: 28 } : { top: 200, bottom: 72, left: 72, right: 72 };
      m.fitBounds([[w, s], [e, n]], { padding, duration: first ? 0 : 900, maxZoom: 8 });
    }
  }

  useEffect(() => {
    pending.current = { area, hotspots, cells };
    apply(area, hotspots, cells);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, hotspots, cells]);

  return (
    <>
      <div ref={el} className="map" aria-label={cells ? "Map of next week's fire chance (model estimate)" : "Map of fire hotspots for the selected month"} role="region" />
      {noImagery && (
        <p className="map-imagery-note" role="status">Satellite imagery could not load.<span className="map-imagery-more"> Showing plain country outlines instead.</span></p>
      )}
    </>
  );
}
