import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Area, Hotspots, Polygon } from '../types';
import { SATELLITE_LABEL } from '../types';
import { FRP_STOPS } from '../colors';
import { areaBbox, closeRing, rectToPolygon } from '../geo';
import { fmtTimeUtc } from '../format';

export type DrawMode = 'none' | 'rect' | 'polygon';

interface Props {
  area: Area | null;
  hotspots: Hotspots | null;
  drawMode: DrawMode;
  onDrawDone: (p: Polygon) => void;
  onDrawCancel: () => void;
}

// Basemap: NASA GIBS (Blue Marble shaded relief) — imagery only, no data used in numbers.
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
    { id: 'bg', type: 'background', paint: { 'background-color': '#0b0e14' } },
    { id: 'bluemarble', type: 'raster', source: 'bluemarble', paint: { 'raster-brightness-max': 0.55, 'raster-saturation': -0.45, 'raster-contrast': 0.1 } },
  ],
};

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export function MapView({ area, hotspots, drawMode, onDrawDone, onDrawCancel }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const pending = useRef<{ area: Area | null; hotspots: Hotspots | null }>({ area, hotspots });
  const draw = useRef({ mode: drawMode, start: null as maplibregl.LngLat | null, pts: [] as [number, number][] });
  const cb = useRef({ onDrawDone, onDrawCancel });
  cb.current = { onDrawDone, onDrawCancel };

  // ---------- init ----------
  useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({
      container: el.current,
      style: STYLE,
      center: [-54, -14],
      zoom: 3.3,
      minZoom: 2,
      maxZoom: 11,
      attributionControl: { compact: true },
      cooperativeGestures: false,
    });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    // 'style.load' fires once the style is parsed, without waiting for basemap tiles.
    const init = () => {
      if (ready.current || m.getSource('area')) return;
      m.addSource('area', { type: 'geojson', data: EMPTY });
      m.addLayer({ id: 'area-fill', type: 'fill', source: 'area', paint: { 'fill-color': '#f98e09', 'fill-opacity': 0.06 } });
      m.addLayer({ id: 'area-line', type: 'line', source: 'area', paint: { 'line-color': '#f9cb35', 'line-width': 1.6, 'line-dasharray': [3, 2] } });

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
          'circle-color': ['interpolate', ['linear'], ['get', 'frp'], ...FRP_STOPS.flat()] as any,
          'circle-stroke-color': '#0b0e14', 'circle-stroke-width': 0.6,
          'circle-opacity': ['case', ['get', 'provisional'], 0.65, 0.95],
        },
      });

      m.addSource('draft', { type: 'geojson', data: EMPTY });
      m.addLayer({ id: 'draft-fill', type: 'fill', source: 'draft', paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.08 } });
      m.addLayer({ id: 'draft-line', type: 'line', source: 'draft', paint: { 'line-color': '#ffffff', 'line-width': 1.5 } });
      m.addLayer({ id: 'draft-pts', type: 'circle', source: 'draft', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 4, 'circle-color': '#fff' } });

      const popup = new maplibregl.Popup({ closeButton: false, className: 'hs-popup', offset: 8 });
      m.on('mouseenter', 'hotspots', () => (m.getCanvas().style.cursor = 'pointer'));
      m.on('mouseleave', 'hotspots', () => {
        m.getCanvas().style.cursor = draw.current.mode === 'none' ? '' : 'crosshair';
        popup.remove();
      });
      m.on('mousemove', 'hotspots', (e) => {
        if (draw.current.mode !== 'none') return;
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as any;
        popup
          .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
          .setHTML(
            `<b>${p.date}</b> · ${fmtTimeUtc(p.time_utc)} · ${p.daynight === 'D' ? 'day' : 'night'}<br/>` +
              `${SATELLITE_LABEL[p.satellite as keyof typeof SATELLITE_LABEL] ?? p.satellite}<br/>` +
              `Fire strength <b>${p.frp} MW</b> · confidence ${p.confidence}` +
              (p.provisional ? '<br/><i>Provisional</i>' : ''),
          )
          .addTo(m);
      });

      ready.current = true;
      apply(pending.current.area, pending.current.hotspots, true);
    };
    m.once('style.load', init);
    m.once('load', init);

    // ---------- drawing ----------
    const setDraft = (fc: GeoJSON.FeatureCollection) => (m.getSource('draft') as maplibregl.GeoJSONSource | undefined)?.setData(fc);
    const rectFc = (a: maplibregl.LngLat, b: maplibregl.LngLat): GeoJSON.FeatureCollection => ({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: rectToPolygon(a.lng, a.lat, b.lng, b.lat) }],
    });
    const polyFc = (pts: [number, number][], cursor?: [number, number]): GeoJSON.FeatureCollection => {
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
      cb.current.onDrawDone(rectToPolygon(a.lng, a.lat, b.lng, b.lat));
    };
    const click = (e: maplibregl.MapMouseEvent) => {
      const d = draw.current;
      if (d.mode !== 'polygon') return;
      const pt: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      if (d.pts.length >= 3) {
        const first = m.project(d.pts[0]);
        if (Math.hypot(first.x - e.point.x, first.y - e.point.y) < 12) return finishPoly();
      }
      d.pts.push(pt);
      setDraft(polyFc(d.pts));
    };
    const finishPoly = () => {
      const d = draw.current;
      if (d.pts.length >= 3) cb.current.onDrawDone(closeRing(d.pts));
      d.pts = [];
      setDraft(EMPTY);
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
    if (drawMode === 'rect') m.dragPan.disable();
    else m.dragPan.enable();
    if (drawing) m.doubleClickZoom.disable();
    else m.doubleClickZoom.enable();
  }, [drawMode]);

  // ---------- data ----------
  const lastAreaKey = useRef('');
  function apply(a: Area | null, h: Hotspots | null, first = false) {
    const m = map.current;
    if (!m || !ready.current) return;
    (m.getSource('area') as maplibregl.GeoJSONSource).setData(
      a ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: a }] } : EMPTY,
    );
    (m.getSource('hotspots') as maplibregl.GeoJSONSource).setData((h as unknown as GeoJSON.FeatureCollection) ?? EMPTY);
    const key = a ? JSON.stringify(a.coordinates).slice(0, 200) : '';
    if (a && key !== lastAreaKey.current) {
      lastAreaKey.current = key;
      const [w, s, e, n] = areaBbox(a);
      m.fitBounds([[w, s], [e, n]], { padding: 36, duration: first ? 0 : 900, maxZoom: 8 });
    }
  }

  useEffect(() => {
    pending.current = { area, hotspots };
    apply(area, hotspots);
  }, [area, hotspots]);

  return <div ref={el} className="map" aria-label="Map of fire hotspots for the selected month" role="region" />;
}
