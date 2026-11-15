// Minimal globe, flat and light: Brazil in white with its state borders, the rest of the world sits back.
// Country outlines are Natural Earth (public domain), decoration only. State borders (states.ts) can also select the area.
import { useEffect, useRef, useState } from 'react';
import { geoOrthographic, geoPath, geoInterpolate, geoDistance, geoCentroid, type GeoProjection } from 'd3-geo';
import { feature } from 'topojson-client';
import type { FeatureCollection, Geometry } from 'geojson';
import type { AreaGeometry } from '../types';
import { STATE_BORDERS, stateAt, stateById, type StateFeature } from '../states';
import { flameElement } from './Flames';
import type { FlameSpot } from '../geo';

interface World {
  brazil: FeatureCollection<Geometry>;
  others: FeatureCollection<Geometry>;
}

let worldPromise: Promise<World> | null = null;
/** Natural Earth outlines (display only). Also the map's fallback ground when its imagery cannot load. */
export function loadWorld(): Promise<World> {
  worldPromise ??= import('world-atlas/countries-50m.json').then((m) => {
    const topo = m.default as any;
    const all = feature(topo, topo.objects.countries) as unknown as FeatureCollection<Geometry>;
    return {
      brazil: { type: 'FeatureCollection', features: all.features.filter((f) => f.id === '076') },
      others: { type: 'FeatureCollection', features: all.features.filter((f) => f.id !== '076') },
    };
  });
  return worldPromise;
}

export const BRAZIL_CENTER: [number, number] = [-53, -14];

// Flat colours of the light theme (nothing shaded, no glow). Keep OCEAN in sync with --stage in styles.css.
export const OCEAN = '#e9edf2';
const LAND = '#f6f7f9';
const LAND_EDGE = '#d9dde4';
const BRAZIL = '#ffffff';
const BRAZIL_EDGE = '#8b93a1';
const STATE_EDGE = '#cfd4dc';
const EMBER = '#d9480f';
const EMBER_TINT = '#fbe3d6';
const EMBER_HOVER = '#fff1e8';

interface Props {
  center?: [number, number];
  zoom?: number; // 1 = whole globe fits the box
  area?: AreaGeometry | null;
  /** the chosen state (its fill is tinted); other areas are outlined only */
  selected?: string | null;
  points?: [number, number][];
  /** the point chosen on the location step: drawn as a clear marker, not as a hotspot dot */
  pick?: [number, number] | null;
  onPick?: (lon: number, lat: number) => void;
  /** with this, the state under the pointer highlights and lifts, and a click (or tap) selects it */
  onState?: (s: StateFeature) => void;
  /** a state highlighted from outside (the list beside the globe) */
  hover?: string | null;
  onHover?: (id: string | null) => void;
  label: string;
  /** vertical position of the globe centre, as a fraction of the box height */
  originY?: number;
  /** animated flames where the satellites saw fire this month (geo.ts fireSpots): places and sizes come from the data */
  flames?: FlameSpot[];
}

export default function Globe({ center = BRAZIL_CENTER, zoom = 1.5, area, selected, points, pick, onPick, onState, hover, onHover, label, originY = 0.5, flames }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const world = useRef<World | null>(null);
  const view = useRef({ center, zoom });
  const proj = useRef<GeoProjection | null>(null);
  const extras = useRef({ area, selected, points, pick, originY });
  extras.current = { area, selected, points, pick, originY };
  const raf = useRef(0);
  const flameLayer = useRef<HTMLDivElement>(null);
  const flameEls = useRef<{ el: HTMLElement; at: [number, number] }[]>([]);
  // the lifted state: `t` runs 0 → 1 while it rises
  const lift = useRef<{ id: string | null; t: number; raf: number }>({ id: null, t: 0, raf: 0 });
  const [tip, setTip] = useState<{ name: string; x: number; y: number } | null>(null);
  const still = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const { center: c, zoom: z } = view.current;
    const R = (Math.min(w, h) / 2) * z;
    const cx = w / 2;
    const cy = h * extras.current.originY;
    const projection = geoOrthographic().scale(R).translate([cx, cy]).rotate([-c[0], -c[1]]).clipAngle(90);
    proj.current = projection;
    const path = geoPath(projection, ctx);

    // the ocean: one flat disc
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = OCEAN;
    ctx.fill();

    if (world.current) {
      ctx.beginPath();
      path(world.current.others);
      ctx.fillStyle = LAND;
      ctx.fill();
      ctx.lineWidth = 0.75;
      ctx.strokeStyle = LAND_EDGE;
      ctx.stroke();

      ctx.beginPath();
      path(world.current.brazil);
      ctx.fillStyle = BRAZIL;
      ctx.fill();
    }

    const { area: a, points: pts, selected: sel } = extras.current;
    const chosen = stateById(sel);
    if (chosen) {
      ctx.beginPath();
      path(chosen);
      ctx.fillStyle = EMBER_TINT;
      ctx.fill();
    }
    // borders between the states, then the country's edge
    ctx.beginPath();
    path(STATE_BORDERS);
    ctx.lineWidth = 0.75;
    ctx.strokeStyle = STATE_EDGE;
    ctx.stroke();
    if (world.current) {
      ctx.beginPath();
      path(world.current.brazil);
      ctx.lineWidth = 1;
      ctx.strokeStyle = BRAZIL_EDGE;
      ctx.stroke();
    }

    // the state under the pointer: raised a few pixels over a soft shadow
    const up = stateById(lift.current.id);
    if (up && up.properties.id !== sel) {
      const t = lift.current.t;
      ctx.save();
      ctx.translate(0, -4 * t);
      ctx.shadowColor = `rgba(29, 29, 31, ${0.22 * t})`;
      ctx.shadowBlur = 14 * t;
      ctx.shadowOffsetY = 7 * t;
      ctx.beginPath();
      path(up);
      ctx.fillStyle = EMBER_HOVER;
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = EMBER;
      ctx.stroke();
      ctx.restore();
    }

    if (pts?.length) {
      ctx.fillStyle = 'rgba(194, 65, 12, 0.8)';
      const r = Math.max(1.6, Math.min(3.2, R / 900));
      for (const p of pts) {
        if (geoDistance(p, c) > Math.PI / 2) continue;
        const xy = projection(p);
        if (!xy) continue;
        ctx.beginPath();
        ctx.arc(xy[0], xy[1], r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // the flames (where fire was seen): HTML over the canvas, moved with the globe, hidden on its far side
    for (const f of flameEls.current) {
      const xy = geoDistance(f.at, c) <= Math.PI / 2 - 0.02 ? projection(f.at) : null;
      if (!xy) {
        f.el.style.display = 'none';
        continue;
      }
      f.el.style.display = '';
      f.el.style.left = `${xy[0]}px`;
      f.el.style.top = `${xy[1]}px`;
    }

    const pk = extras.current.pick;
    if (pk && geoDistance(pk, c) <= Math.PI / 2) {
      const xy = projection(pk);
      if (xy) {
        ctx.beginPath();
        ctx.arc(xy[0], xy[1], 13, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(217, 72, 15, 0.18)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(xy[0], xy[1], 5.5, 0, Math.PI * 2);
        ctx.fillStyle = EMBER;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }
    }
    if (a) {
      // Drawn as a line (not a filled polygon) so ring winding order never matters.
      ctx.beginPath();
      path({ type: 'MultiLineString', coordinates: a.type === 'Polygon' ? a.coordinates : a.coordinates.flat() });
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2;
      ctx.strokeStyle = EMBER;
      ctx.stroke();
    }
  };

  // load outlines once
  useEffect(() => {
    let alive = true;
    loadWorld().then((w) => {
      if (!alive) return;
      world.current = w;
      draw();
    });
    const ro = new ResizeObserver(draw);
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => {
      alive = false;
      ro.disconnect();
      cancelAnimationFrame(raf.current);
      cancelAnimationFrame(lift.current.raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // glide to a new centre / zoom
  useEffect(() => {
    cancelAnimationFrame(raf.current);
    const from = { ...view.current };
    const same = from.center[0] === center[0] && from.center[1] === center[1] && from.zoom === zoom;
    if (still() || same) {
      view.current = { center, zoom };
      draw();
      return;
    }
    const ic = geoInterpolate(from.center, center);
    const t0 = performance.now();
    const dur = 900;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      view.current = {
        center: ic(e) as [number, number],
        zoom: Math.exp(Math.log(from.zoom) + (Math.log(zoom) - Math.log(from.zoom)) * e),
      };
      draw();
      if (t < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center[0], center[1], zoom]);

  useEffect(draw, [area, selected, points, pick, originY]); // eslint-disable-line react-hooks/exhaustive-deps

  // (re)build the flames when their places change
  useEffect(() => {
    const layer = flameLayer.current;
    if (!layer) return;
    layer.replaceChildren();
    flameEls.current = (flames ?? []).map(({ at, w }, i) => {
      const el = flameElement(i, w);
      layer.appendChild(el);
      return { el, at };
    });
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flames]);

  // ---------- states: highlight, lift, select ----------
  const raise = (id: string | null) => {
    const l = lift.current;
    if (l.id === id) return;
    cancelAnimationFrame(l.raf);
    l.id = id;
    const s = stateById(id);
    const xy = s && proj.current ? proj.current(geoCentroid(s)) : null;
    setTip(s && xy ? { name: s.properties.name, x: xy[0], y: xy[1] } : null);
    if (!id || still()) {
      l.t = id ? 1 : 0;
      draw();
      return;
    }
    l.t = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 140);
      l.t = 1 - Math.pow(1 - t, 3);
      draw();
      if (t < 1) l.raf = requestAnimationFrame(step);
    };
    l.raf = requestAnimationFrame(step);
  };
  useEffect(() => raise(hover ?? null), [hover]); // eslint-disable-line react-hooks/exhaustive-deps

  const lonLat = (e: React.MouseEvent<HTMLCanvasElement>): [number, number] | null => {
    if (!proj.current) return null;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const [tx, ty] = proj.current.translate();
    if (Math.hypot(x - tx, y - ty) > proj.current.scale()) return null; // outside the globe
    const ll = proj.current.invert?.([x, y]);
    return ll && isFinite(ll[0]) && isFinite(ll[1]) ? [ll[0], ll[1]] : null;
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!onState || e.pointerType !== 'mouse') return;
    const ll = lonLat(e);
    const id = (ll && stateAt(ll[0], ll[1])?.properties.id) || null;
    if (id !== lift.current.id) {
      raise(id);
      onHover?.(id);
    }
  };
  const leave = () => {
    if (!onState || !lift.current.id) return;
    raise(null);
    onHover?.(null);
  };

  const click = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const ll = lonLat(e);
    if (!ll) return;
    if (onState) {
      const s = stateAt(ll[0], ll[1]);
      if (s) return onState(s);
    }
    onPick?.(ll[0], ll[1]);
  };

  return (
    <>
      <canvas
        ref={canvasRef}
        className={'globe' + (onPick ? ' globe--pick' : '') + (tip && onState ? ' globe--state' : '')}
        role="img"
        aria-label={label}
        onClick={click}
        onPointerMove={move}
        onPointerLeave={leave}
      />
      <div ref={flameLayer} className="flames-layer" aria-hidden="true" />
      {tip && <span className="globe-tip" style={{ left: tip.x, top: tip.y }} aria-hidden="true">{tip.name}</span>}
    </>
  );
}

/** Zoom that makes an area of this angular radius fill about a third of the view. */
export function zoomForRadius(radiusDeg: number, min = 1.5, max = 9): number {
  const z = 0.34 / Math.sin(Math.min(89, Math.max(0.05, radiusDeg)) * (Math.PI / 180));
  return Math.max(min, Math.min(max, z));
}
