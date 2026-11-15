// Brazil's 27 states (26 + Distrito Federal): Natural Earth admin-1, 1:50m, public domain.
// Decided by Mike (UI/UX owner): state borders may be shown AND used to select the data area.
// The file is built with mapshaper from ne_50m_admin_1_states_provinces (Brazil only, islands under 400 km² dropped).
import { feature, mesh } from 'topojson-client';
import { geoBounds, geoCentroid, geoContains } from 'd3-geo';
import type { Feature, MultiLineString, MultiPolygon, Polygon, Position } from 'geojson';
import topo from './data/brazil-states.json';
import type { Area } from './geo';

export type StateFeature = Feature<Polygon | MultiPolygon, { id: string; name: string }>;

const t = topo as any;
export const STATES: StateFeature[] = (feature(t, t.objects.admin1) as any).features
  .slice()
  .sort((a: StateFeature, b: StateFeature) => a.properties.name.localeCompare(b.properties.name, 'pt'));

/** Borders between two states (drawn once, thin) */
export const STATE_BORDERS: MultiLineString = mesh(t, t.objects.admin1, (a, b) => a !== b);

const boxes = new Map(STATES.map((s) => [s.properties.id, geoBounds(s)]));

export const stateById = (id: string | null | undefined) => (id ? STATES.find((s) => s.properties.id === id) ?? null : null);

/** The state under a point, or null (ocean, another country). */
export function stateAt(lon: number, lat: number): StateFeature | null {
  for (const s of STATES) {
    const [[w, so], [e, n]] = boxes.get(s.properties.id)!;
    if (lon < w || lon > e || lat < so || lat > n) continue;
    if (geoContains(s, [lon, lat])) return s;
  }
  return null;
}

const ringArea = (r: Position[]) => r.reduce((acc, [x, y], i) => acc + x * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * y, 0);
/** RFC 7946 winding for the API: outer rings counter-clockwise, holes clockwise. */
const rewind = (poly: Position[][]) => poly.map((r, i) => ((ringArea(r) > 0) === (i === 0) ? r : r.slice().reverse()));

/** A state as the area of the page: its real border goes to the API, in [lon, lat] order like any drawn area. */
export function stateArea(s: StateFeature): Area {
  const g = s.geometry;
  const polygon: Polygon | MultiPolygon =
    g.type === 'Polygon' ? { type: 'Polygon', coordinates: rewind(g.coordinates) } : { type: 'MultiPolygon', coordinates: g.coordinates.map(rewind) };
  const [[w, so], [e, n]] = boxes.get(s.properties.id)!;
  const c = geoCentroid(s);
  return { label: s.properties.name, polygon, center: [c[0], c[1]], radiusDeg: Math.max(e - w, n - so) / 2, stateId: s.properties.id };
}

/** "sao paulo" matches "São Paulo"; "sp" matches its code */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export function searchStates(q: string): StateFeature[] {
  const f = fold(q);
  if (!f) return STATES;
  return STATES.filter((s) => fold(s.properties.name).includes(f) || s.properties.id.toLowerCase() === f);
}
