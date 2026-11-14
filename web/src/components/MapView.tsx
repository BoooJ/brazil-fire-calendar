// The fire map: hotspots of one month on NASA imagery, and the tool to draw an area (rectangle or polygon).
// It sits in the same place as the globe and takes over when there are points to show or an area to draw.
import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection, Point, Polygon } from 'geojson';
import type { AreaGeometry, Hotspots, SatelliteKey } from '../types';
import { SAT_NAMES } from '../types';
import { FRP_STOPS } from '../colors';
import { areaBbox, closeRing, rectPolygon } from '../geo';
import { timeUtc } from '../format';

export type DrawMode = 'none' | 'rect' | 'polygon';

interface Props {
  area: AreaGeometry | null;
  hotspots: Hotspots | null;
  /** a chosen point, marked with a pin */
  pin?: [number, number] | null;
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

export default function MapView({ area, hotspots, pin, drawMode, onDrawDone, onDrawCancel, onUnavailable }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const pending = useRef<{ area: AreaGeometry | null; hotspots: Hotspots | null }>({ area, hotspots });
  const draw = useRef({ mode: drawMode, start: null as maplibregl.LngLat | null, pts: [] as [number, number][] });
  const cb = useRef({ onDrawDone, onDrawCancel, onUnavailable });
  cb.current = { onDrawDone, onDrawCancel, onUnavailable };

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

    // 'style.load' fires once the style is parsed, without waiting for basemap tiles.
    const init = () => {
      if (ready.current || m.getSource('area')) return;
      m.addSource('area', { type: 'geojson', data: EMPTY });
      m.addLayer({ id: 'area-fill', type: 'fill', source: 'area', paint: { 'fill-color': '#ff6a1f', 'fill-opacity': 0.06 } });
      m.addLayer({ id: 'area-line', type: 'line', source: 'area', paint: { 'line-color': '#ff6a1f', 'line-width': 2 } });

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

      const popup = new maplibregl.Popup({ closeButton: false, className: 'hs-popup', offset: 8 });
      const show = (e: maplibregl.MapLayerMouseEvent) => {
        if (draw.current.mode !== 'none') return;
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as Record<string, unknown>;
        popup
          .setLngLat((f.geometry as Point).coordinates as [number, number])
          .setHTML(
            `<b>${esc(p.date)}</b> · ${esc(timeUtc(String(p.time_utc ?? '')))} · ${p.daynight === 'D' ? 'day' : 'night'}<br/>` +
              `${esc(SAT_NAMES[p.satellite as SatelliteKey] ?? p.satellite)}<br/>` +
              `Fire strength <b>${p.frp == null ? 'not measured' : `${esc(p.frp)} MW`}</b> · confidence ${esc(p.confidence)}` +
              (p.provisional ? '<br/><i>Provisional</i>' : ''),
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

      ready.current = true;
      apply(pending.current.area, pending.current.hotspots, true);
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
  function apply(a: AreaGeometry | null, h: Hotspots | null, first = false) {
    const m = map.current;
    if (!m || !ready.current) return;
    (m.getSource('area') as maplibregl.GeoJSONSource).setData(
      a ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: a }] } : EMPTY,
    );
    (m.getSource('hotspots') as maplibregl.GeoJSONSource).setData((h as unknown as FeatureCollection) ?? EMPTY);
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
    pending.current = { area, hotspots };
    apply(area, hotspots);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, hotspots]);

  // ---------- the pin ----------
  useEffect(() => {
    const m = map.current;
    if (!m || !pin || !isFinite(pin[0]) || !isFinite(pin[1])) return;
    const node = document.createElement('div');
    node.className = 'map-pin';
    node.innerHTML =
      '<svg width="22" height="30" viewBox="0 0 22 30" aria-hidden="true"><path d="M11 29C11 29 2 18.5 2 11a9 9 0 0 1 18 0c0 7.5-9 18-9 18z" fill="#e8402a" stroke="#fff" stroke-width="1.5"/><circle cx="11" cy="11" r="3.3" fill="#fff"/></svg>';
    const marker = new maplibregl.Marker({ element: node, anchor: 'bottom' }).setLngLat(pin).addTo(m);
    return () => {
      marker.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin?.[0], pin?.[1]]);

  return <div ref={el} className="map" aria-label="Map of fire hotspots for the selected month" role="region" />;
}
