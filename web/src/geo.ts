// Area helpers. GeoJSON order is always [lon, lat].
import type { Polygon, Position } from 'geojson';
import type { Preset } from './types';

export interface Area {
  label: string;
  polygon: Polygon;
  center: [number, number]; // [lon, lat]
  radiusDeg: number; // angular size, used to zoom the globe
  presetId?: string;
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

export function circleArea(lon: number, lat: number, radiusKm: number, label?: string): Area {
  return {
    label: label ?? `${fmtCoord(lat, 'S', 'N')}, ${fmtCoord(lon, 'W', 'E')} · ${radiusKm} km`,
    polygon: circlePolygon(lon, lat, radiusKm),
    center: [lon, lat],
    radiusDeg: (radiusKm / EARTH_KM) / RAD,
  };
}

export function presetArea(p: Preset): Area {
  const ring = p.area.coordinates[0];
  const lons = ring.map((c) => c[0]);
  const lats = ring.map((c) => c[1]);
  const w = Math.min(...lons), e = Math.max(...lons), s = Math.min(...lats), n = Math.max(...lats);
  return {
    label: p.name,
    polygon: p.area,
    center: [(w + e) / 2, (s + n) / 2],
    radiusDeg: Math.max(e - w, n - s) / 2,
    presetId: p.id,
  };
}

export function insideBox(lon: number, lat: number, box: Polygon): boolean {
  const ring = box.coordinates[0];
  const lons = ring.map((c) => c[0]);
  const lats = ring.map((c) => c[1]);
  return lon >= Math.min(...lons) && lon <= Math.max(...lons) && lat >= Math.min(...lats) && lat <= Math.max(...lats);
}

function fmtCoord(v: number, neg: string, pos: string) {
  return `${Math.abs(v).toFixed(2)}°${v < 0 ? neg : pos}`;
}
