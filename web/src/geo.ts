// Area helpers. GeoJSON order is always [lon, lat].
import type { Area, Polygon } from './types';

export function rectToPolygon(west: number, south: number, east: number, north: number): Polygon {
  const w = Math.min(west, east);
  const e = Math.max(west, east);
  const s = Math.min(south, north);
  const n = Math.max(south, north);
  return {
    type: 'Polygon',
    coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]],
  };
}

/** lat/lon + radius (km) -> 64-point polygon (closed ring, 65 positions). */
export function circleToPolygon(lat: number, lon: number, radiusKm: number, points = 64): Polygon {
  const R = 6371.0088;
  const d = radiusKm / R;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lon * Math.PI) / 180;
  const ring: [number, number][] = [];
  for (let i = 0; i < points; i++) {
    const θ = (2 * Math.PI * i) / points;
    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(θ));
    const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(d) * Math.cos(φ1), Math.cos(d) - Math.sin(φ1) * Math.sin(φ2));
    ring.push([round6(((λ2 * 180) / Math.PI + 540) % 360 - 180), round6((φ2 * 180) / Math.PI)]);
  }
  ring.push(ring[0]);
  return { type: 'Polygon', coordinates: [ring] };
}

export function closeRing(points: [number, number][]): Polygon {
  const ring = points.map(([x, y]) => [round6(x), round6(y)] as [number, number]);
  const [fx, fy] = ring[0];
  const [lx, ly] = ring[ring.length - 1];
  if (fx !== lx || fy !== ly) ring.push([fx, fy]);
  return { type: 'Polygon', coordinates: [ring] };
}

export function areaBbox(area: Area): [number, number, number, number] {
  const rings = area.type === 'Polygon' ? area.coordinates : area.coordinates.flat();
  let w = 180, s = 90, e = -180, n = -90;
  for (const ring of rings)
    for (const [x, y] of ring) {
      w = Math.min(w, x); e = Math.max(e, x);
      s = Math.min(s, y); n = Math.max(n, y);
    }
  return [w, s, e, n];
}

export function pointCount(area: Area): number {
  const rings = area.type === 'Polygon' ? area.coordinates : area.coordinates.flat();
  return rings.reduce((acc, r) => acc + r.length, 0);
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;
