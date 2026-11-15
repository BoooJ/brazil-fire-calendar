// Minimal globe: Brazil is lit, the rest of the world sits back in the dark.
// Country outlines are Natural Earth (public domain) — decoration only, never used for numbers.
import { useEffect, useRef } from 'react';
import { geoOrthographic, geoPath, geoInterpolate, geoDistance, type GeoProjection } from 'd3-geo';
import { feature } from 'topojson-client';
import type { FeatureCollection, Geometry, Polygon } from 'geojson';

interface World {
  brazil: FeatureCollection<Geometry>;
  others: FeatureCollection<Geometry>;
}

let worldPromise: Promise<World> | null = null;
function loadWorld(): Promise<World> {
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

interface Props {
  center?: [number, number];
  zoom?: number; // 1 = whole globe fits the box
  area?: Polygon | null;
  points?: [number, number][];
  /** the point chosen on the location step: drawn as a clear marker, not as a hotspot dot */
  pick?: [number, number] | null;
  onPick?: (lon: number, lat: number) => void;
  label: string;
  /** vertical position of the globe centre, as a fraction of the box height */
  originY?: number;
}

export default function Globe({ center = BRAZIL_CENTER, zoom = 1.5, area, points, pick, onPick, label, originY = 0.5 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const world = useRef<World | null>(null);
  const view = useRef({ center, zoom });
  const proj = useRef<GeoProjection | null>(null);
  const extras = useRef({ area, points, pick, originY });
  extras.current = { area, points, pick, originY };
  const raf = useRef(0);

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

    // ocean + blue limb glow
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.shadowColor = 'rgba(46, 72, 255, 0.95)';
    ctx.shadowBlur = Math.min(70, R * 0.12);
    ctx.fillStyle = '#01020a';
    ctx.fill();
    ctx.restore();
    const atm = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R);
    atm.addColorStop(0, 'rgba(30, 50, 255, 0)');
    atm.addColorStop(1, 'rgba(30, 50, 255, 0.55)');
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = atm;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#2f45ff';
    ctx.stroke();

    if (world.current) {
      ctx.beginPath();
      path(world.current.others);
      ctx.fillStyle = '#0a0d55';
      ctx.fill();
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = '#01020a';
      ctx.stroke();

      ctx.beginPath();
      path(world.current.brazil);
      ctx.fillStyle = '#bcc0cf';
      ctx.fill();
    }

    const { area: a, points: pts } = extras.current;
    if (pts?.length) {
      ctx.fillStyle = 'rgba(214, 31, 38, 0.8)';
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
    const pk = extras.current.pick;
    if (pk && geoDistance(pk, c) <= Math.PI / 2) {
      const xy = projection(pk);
      if (xy) {
        // a soft halo, then an orange dot with a white edge: visible on light Brazil and on the dark ocean
        ctx.beginPath();
        ctx.arc(xy[0], xy[1], 13, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 106, 31, 0.22)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(xy[0], xy[1], 5.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ff6a1f';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }
    }
    if (a) {
      // Drawn as a line (not a filled polygon) so ring winding order never matters.
      ctx.beginPath();
      path({ type: 'MultiLineString', coordinates: a.coordinates });
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(255, 106, 31, 0.25)';
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ff6a1f';
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // glide to a new centre / zoom
  useEffect(() => {
    cancelAnimationFrame(raf.current);
    const from = { ...view.current };
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const same = from.center[0] === center[0] && from.center[1] === center[1] && from.zoom === zoom;
    if (reduce || same) {
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

  useEffect(draw, [area, points, pick, originY]); // eslint-disable-line react-hooks/exhaustive-deps

  const click = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onPick || !proj.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const [tx, ty] = proj.current.translate();
    if (Math.hypot(x - tx, y - ty) > proj.current.scale()) return; // outside the globe
    const ll = proj.current.invert?.([x, y]);
    if (ll && isFinite(ll[0]) && isFinite(ll[1])) onPick(ll[0], ll[1]);
  };

  return (
    <canvas
      ref={canvasRef}
      className={'globe' + (onPick ? ' globe--pick' : '')}
      role="img"
      aria-label={label}
      onClick={click}
    />
  );
}

/** Zoom that makes an area of this angular radius fill about a third of the view. */
export function zoomForRadius(radiusDeg: number, min = 1.5, max = 9): number {
  const z = 0.34 / Math.sin(Math.min(89, Math.max(0.05, radiusDeg)) * (Math.PI / 180));
  return Math.max(min, Math.min(max, z));
}
