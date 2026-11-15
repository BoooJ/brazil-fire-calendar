// Area helpers. GeoJSON order is always [lon, lat].
import type { Polygon, Position } from 'geojson';
import type { AreaGeometry, Preset } from './types';

export interface Area {
  label: string;
  /** a box, circle or drawn shape (Polygon), or a state's real border (Polygon or MultiPolygon) */
  polygon: AreaGeometry;
  center: [number, number]; // [lon, lat]
  radiusDeg: number; // angular size, used to zoom the globe
  presetId?: string;
  /** a Brazilian state picked by its border (states.ts), e.g. 'RR' */
  stateId?: string;
}

const RAD = Math.PI / 180;
const EARTH_KM = 6371;

/** lat/lon + radius -> closed 64-point polygon, counter-clockwise (RFC 7946). */
export function circlePolygon(lon: number, lat: number, radiusKm: number, points = 64): Polygon {
  const d = radiusKm / EARTH_KM;
  const lat1 = lat * RAD;
  const lon1 = lon * RAD;
  const ring: Position[] = [];
  for (let i = 0; i < points; i++) {
    const brng = -(2 * Math.PI * i) / points; // negative bearing step = counter-clockwise
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
    const lon2 =
      lon1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    ring.push([round(lon2 / RAD), round(lat2 / RAD)]);
  }
  ring.push(ring[0]);
  return { type: 'Polygon', coordinates: [ring] };
}

const round = (n: number) => Math.round(n * 1e5) / 1e5;

/** Two opposite corners -> closed box, counter-clockwise. */
export function rectPolygon(lonA: number, latA: number, lonB: number, latB: number): Polygon {
  const w = round(Math.min(lonA, lonB)), e = round(Math.max(lonA, lonB));
  const s = round(Math.min(latA, latB)), n = round(Math.max(latA, latB));
  return { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] };
}

/** Clicked corners -> closed ring, counter-clockwise. */
export function closeRing(points: [number, number][]): Polygon {
  let ring: Position[] = points.map(([x, y]) => [round(x), round(y)]);
  let twiceArea = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    twiceArea += x1 * y2 - x2 * y1;
  }
  if (twiceArea < 0) ring = ring.reverse();
  const [fx, fy] = ring[0];
  const [lx, ly] = ring[ring.length - 1];
  if (fx !== lx || fy !== ly) ring.push([fx, fy]);
  return { type: 'Polygon', coordinates: [ring] };
}

/** [west, south, east, north] */
export function areaBbox(area: AreaGeometry): [number, number, number, number] {
  const rings = area.type === 'Polygon' ? area.coordinates : area.coordinates.flat();
  let w = 180, s = 90, e = -180, n = -90;
  for (const ring of rings)
    for (const [x, y] of ring) {
      w = Math.min(w, x); e = Math.max(e, x);
      s = Math.min(s, y); n = Math.max(n, y);
    }
  return [w, s, e, n];
}

/** The API accepts at most 1,000 points. */
export function pointCount(area: AreaGeometry): number {
  const rings = area.type === 'Polygon' ? area.coordinates : area.coordinates.flat();
  return rings.reduce((acc, r) => acc + r.length, 0);
}

export function circleArea(lon: number, lat: number, radiusKm: number, label?: string): Area {
  return {
    label: label ?? `${fmtCoord(lat, 'S', 'N')}, ${fmtCoord(lon, 'W', 'E')} · ${radiusKm} km`,
    polygon: circlePolygon(lon, lat, radiusKm),
    center: [lon, lat],
    radiusDeg: (radiusKm / EARTH_KM) / RAD,
  };
}

function boxArea(polygon: Polygon, label: string, presetId?: string): Area {
  const [w, s, e, n] = areaBbox(polygon);
  return { label, polygon, center: [(w + e) / 2, (s + n) / 2], radiusDeg: Math.max(e - w, n - s) / 2, presetId };
}

export const presetArea = (p: Preset): Area => boxArea(p.area, p.name, p.id);

/** A rectangle or polygon drawn on the map. */
export const drawnArea = (polygon: Polygon, label = 'Drawn area'): Area => boxArea(polygon, label);

export function insideBox(lon: number, lat: number, box: Polygon): boolean {
  const [w, s, e, n] = areaBbox(box);
  return lon >= w && lon <= e && lat >= s && lat <= n;
}

function fmtCoord(v: number, neg: string, pos: string) {
  return `${Math.abs(v).toFixed(2)}°${v < 0 ? neg : pos}`;
}

/** Planar point-in-polygon (even-odd over every ring, so holes and winding order don't matter). */
export function insideArea(lon: number, lat: number, area: AreaGeometry): boolean {
  const polys = area.type === 'Polygon' ? [area.coordinates] : area.coordinates;
  let inside = false;
  for (const poly of polys)
    for (const ring of poly)
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
      }
  return inside;
}

/**
 * Up to `n` scattered points inside an area, for the decorative flames on the globe and the map (never data).
 * Seeded from the area, so the same place always gets the same flames.
 */
export function scatterIn(area: AreaGeometry, n: number, seedText: string): [number, number][] {
  let seed = 2166136261;
  for (let i = 0; i < seedText.length; i++) seed = Math.imul(seed ^ seedText.charCodeAt(i), 16777619) >>> 0;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const [w, s, e, nn] = areaBbox(area);
  const out: [number, number][] = [];
  // keep flames apart: a minimum gap of a fraction of the area's size
  const gap = Math.max(e - w, nn - s) / (Math.sqrt(n) * 2.2);
  for (let tries = 0; out.length < n && tries < n * 200; tries++) {
    const p: [number, number] = [w + rand() * (e - w), s + rand() * (nn - s)];
    if (!insideArea(p[0], p[1], area)) continue;
    if (out.some(([x, y]) => Math.hypot(x - p[0], y - p[1]) < gap)) continue;
    out.push(p);
  }
  return out;
}
