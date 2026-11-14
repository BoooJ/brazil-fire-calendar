// The globe: the real planet (NASA Blue Marble), with Brazil in colour and the rest of the world in grey.
// Display only, never used for numbers: the imagery is NASA Blue Marble (via NASA GIBS, two small files in
// public/textures/), the country outlines are Natural Earth (public domain) and only decide which pixels
// keep their colour.
import { useEffect, useRef } from 'react';
import { geoOrthographic, geoPath, geoInterpolate, geoDistance, type GeoProjection } from 'd3-geo';
import { feature } from 'topojson-client';
import type { FeatureCollection, Geometry, Polygon } from 'geojson';
import { getTheme } from '../theme';

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

/** An equirectangular image, decoded once into pixels. */
interface Tex {
  data: Uint8ClampedArray;
  w: number;
  h: number;
  west: number;
  south: number;
  east: number;
  north: number;
}

function loadTex(file: string, west: number, south: number, east: number, north: number): Promise<Tex | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const g = c.getContext('2d', { willReadFrequently: true })!;
        g.drawImage(img, 0, 0);
        resolve({ data: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height, west, south, east, north });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = `${import.meta.env.BASE_URL}textures/${file}`;
  });
}

// The whole world (coarse), and Brazil with its neighbours (sharper, for zoomed-in views).
let texPromise: Promise<{ world: Tex | null; detail: Tex | null }> | null = null;
const loadTextures = () =>
  (texPromise ??= Promise.all([
    loadTex('bluemarble-world.jpg', -180, -90, 180, 90),
    loadTex('bluemarble-brazil.jpg', -85, -36, -30, 8),
  ]).then(([world, detail]) => ({ world, detail })));

export const BRAZIL_CENTER: [number, number] = [-53, -14];

const RAD = Math.PI / 180;

/**
 * Paint the visible half of the planet into `out` (buffer pixels): for every pixel of the disc, find the
 * longitude/latitude it shows (inverse orthographic projection) and copy that pixel of the imagery.
 * Pixels inside `mask` (Brazil) keep their colour; the others turn grey.
 */
function paintPlanet(
  out: ImageData, mask: Uint8ClampedArray | null, cx: number, cy: number, R: number,
  lon0: number, lat0: number, light: boolean, world: Tex, detail: Tex | null,
) {
  const W = out.width, H = out.height, o = out.data;
  const sinP = Math.sin(lat0 * RAD), cosP = Math.cos(lat0 * RAD);
  const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(W - 1, Math.ceil(cx + R));
  const y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(H - 1, Math.ceil(cy + R));
  const wSpanX = world.w / 360, wSpanY = world.h / 180;
  const dSpanX = detail ? detail.w / (detail.east - detail.west) : 0;
  const dSpanY = detail ? detail.h / (detail.north - detail.south) : 0;

  for (let py = y0; py <= y1; py++) {
    const y = (cy - py - 0.5) / R;
    for (let px = x0; px <= x1; px++) {
      const x = (px + 0.5 - cx) / R;
      const r2 = x * x + y * y;
      if (r2 >= 1) continue;
      const z = Math.sqrt(1 - r2);
      const lat = Math.asin(z * sinP + y * cosP) / RAD;
      let lon = lon0 + Math.atan2(x, z * cosP - y * sinP) / RAD;
      if (lon < -180) lon += 360;
      else if (lon >= 180) lon -= 360;

      let r: number, g: number, b: number;
      if (detail && lon > detail.west && lon < detail.east && lat > detail.south && lat < detail.north) {
        const u = Math.min(detail.w - 1, ((lon - detail.west) * dSpanX) | 0);
        const v = Math.min(detail.h - 1, ((detail.north - lat) * dSpanY) | 0);
        const i = (v * detail.w + u) << 2;
        r = detail.data[i]; g = detail.data[i + 1]; b = detail.data[i + 2];
      } else {
        const u = Math.min(world.w - 1, ((lon + 180) * wSpanX) | 0);
        const v = Math.min(world.h - 1, ((90 - lat) * wSpanY) | 0);
        const i = (v * world.w + u) << 2;
        r = world.data[i]; g = world.data[i + 1]; b = world.data[i + 2];
      }

      const j = (py * W + px) << 2;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (mask && mask[j + 3] > 127) {
        // Brazil: the imagery's own colours, a little brighter and richer
        r = (lum + (r - lum) * 1.45) * 1.55 + 8;
        g = (lum + (g - lum) * 1.45) * 1.55 + 8;
        b = (lum + (b - lum) * 1.45) * 1.55 + 8;
      } else if (light) {
        const v = 168 + lum * 0.5;
        r = v - 4; g = v - 1; b = v + 5;
      } else {
        const v = 16 + lum * 0.62;
        r = v * 0.94; g = v * 0.98; b = v * 1.1;
      }
      // the limb is darker, as on a lit ball
      const shade = light ? 0.86 + 0.14 * z : 0.5 + 0.5 * z;
      o[j] = r * shade; o[j + 1] = g * shade; o[j + 2] = b * shade; o[j + 3] = 255;
    }
  }
}

/** A small map pin, its tip on (x, y). */
function drawPin(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const r = 8.5;
  const hy = y - 25 + r; // centre of the round head
  const a0 = 145 * RAD, a1 = 395 * RAD;
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 7;
  ctx.shadowOffsetY = 2;
  ctx.beginPath();
  ctx.arc(x, hy, r, a0, a1);
  ctx.quadraticCurveTo(x + r * 0.34, hy + r * 1.3, x, y);
  ctx.quadraticCurveTo(x - r * 0.34, hy + r * 1.3, x + r * Math.cos(a0), hy + r * Math.sin(a0));
  ctx.closePath();
  ctx.fillStyle = '#e8402a';
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, hy, r * 0.36, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
}

interface Props {
  center?: [number, number];
  zoom?: number; // 1 = whole globe fits the box
  area?: Polygon | null;
  points?: [number, number][];
  /** a chosen point, marked with a pin */
  pin?: [number, number] | null;
  onPick?: (lon: number, lat: number) => void;
  label: string;
  /** vertical position of the globe centre, as a fraction of the box height */
  originY?: number;
}

export default function Globe({ center = BRAZIL_CENTER, zoom = 1.5, area, points, pin, onPick, label, originY = 0.5 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const world = useRef<World | null>(null);
  const tex = useRef<{ world: Tex | null; detail: Tex | null } | null>(null);
  const raster = useRef<HTMLCanvasElement | null>(null);
  const maskCanvas = useRef<HTMLCanvasElement | null>(null);
  const view = useRef({ center, zoom });
  const moving = useRef(false);
  const proj = useRef<GeoProjection | null>(null);
  const extras = useRef({ area, points, pin, originY });
  extras.current = { area, points, pin, originY };
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
    const light = getTheme() === 'light';

    // The canvas may reach further left than the globe's own box (CSS --globe-bleed), so the planet can
    // run under the page's text and fade there instead of ending at a column edge.
    const bleed = Math.max(0, Math.min(w * 0.6, parseFloat(getComputedStyle(canvas).getPropertyValue('--globe-bleed')) || 0));
    const over = Math.max(0, Math.min(w * 0.4, parseFloat(getComputedStyle(canvas).getPropertyValue('--globe-over')) || 0));
    const { center: c, zoom: z } = view.current;
    const R = (Math.min(w - bleed - over, h) / 2) * z;
    const cx = bleed + (w - bleed - over) / 2;
    const cy = h * extras.current.originY;
    const projection = geoOrthographic().scale(R).translate([cx, cy]).rotate([-c[0], -c[1]]).clipAngle(90);
    proj.current = projection;
    const path = geoPath(projection, ctx);
    const disc = () => {
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
    };

    // the ball and its halo: a blue glow in the dark, a soft shadow in the light
    ctx.save();
    disc();
    if (light) {
      ctx.shadowColor = 'rgba(30, 45, 90, 0.28)';
      ctx.shadowBlur = Math.min(60, R * 0.1);
      ctx.shadowOffsetY = Math.min(18, R * 0.03);
      ctx.fillStyle = '#c3c8d2';
    } else {
      ctx.shadowColor = 'rgba(70, 120, 255, 0.85)';
      ctx.shadowBlur = Math.min(70, R * 0.12);
      ctx.fillStyle = '#05070f';
    }
    ctx.fill();
    ctx.restore();

    const t = tex.current;
    if (t?.world) {
      // the imagery, painted at a size the device can afford (coarser while the globe is gliding)
      const budget = moving.current ? 260_000 : 1_500_000;
      const s = Math.max(1, Math.sqrt((w * dpr * h * dpr) / budget));
      const bw = Math.max(2, Math.ceil((w * dpr) / s));
      const bh = Math.max(2, Math.ceil((h * dpr) / s));
      const k = bw / w; // buffer pixels per CSS pixel
      const rc = (raster.current ??= document.createElement('canvas'));
      if (rc.width !== bw || rc.height !== bh) {
        rc.width = bw;
        rc.height = bh;
      }
      const rctx = rc.getContext('2d')!;
      let mask: Uint8ClampedArray | null = null;
      if (world.current) {
        const mc = (maskCanvas.current ??= document.createElement('canvas'));
        if (mc.width !== bw || mc.height !== bh) {
          mc.width = bw;
          mc.height = bh;
        }
        const mctx = mc.getContext('2d', { willReadFrequently: true })!;
        mctx.clearRect(0, 0, bw, bh);
        const mproj = geoOrthographic().scale(R * k).translate([cx * k, cy * k]).rotate([-c[0], -c[1]]).clipAngle(90);
        mctx.beginPath();
        geoPath(mproj, mctx)(world.current.brazil);
        mctx.fillStyle = '#000';
        mctx.fill();
        mask = mctx.getImageData(0, 0, bw, bh).data;
      }
      const img = rctx.createImageData(bw, bh);
      paintPlanet(img, mask, cx * k, cy * k, R * k, c[0], c[1], light, t.world, t.detail);
      rctx.putImageData(img, 0, 0);
      ctx.save();
      disc();
      ctx.clip();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(rc, 0, 0, w, h);
      ctx.restore();
    } else if (world.current) {
      // no imagery (still loading, or it failed): flat shapes
      ctx.beginPath();
      path(world.current.others);
      ctx.fillStyle = light ? '#aeb3bf' : '#23262f';
      ctx.fill();
      ctx.beginPath();
      path(world.current.brazil);
      ctx.fillStyle = '#4f8a3c';
      ctx.fill();
    }

    if (world.current) {
      ctx.beginPath();
      path(world.current.others);
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = light ? 'rgba(20, 25, 40, 0.16)' : 'rgba(255, 255, 255, 0.13)';
      ctx.stroke();
      ctx.beginPath();
      path(world.current.brazil);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = light ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.6)';
      ctx.stroke();
    }

    // atmosphere: a thin haze on the rim
    const atm = ctx.createRadialGradient(cx, cy, R * 0.86, cx, cy, R);
    atm.addColorStop(0, light ? 'rgba(255, 255, 255, 0)' : 'rgba(70, 120, 255, 0)');
    atm.addColorStop(1, light ? 'rgba(255, 255, 255, 0.55)' : 'rgba(70, 120, 255, 0.5)');
    disc();
    ctx.fillStyle = atm;
    ctx.fill();
    ctx.lineWidth = light ? 1 : 1.5;
    ctx.strokeStyle = light ? 'rgba(30, 45, 90, 0.22)' : 'rgba(110, 150, 255, 0.85)';
    ctx.stroke();

    const { area: a, points: pts, pin: p } = extras.current;
    if (pts?.length) {
      ctx.fillStyle = 'rgba(214, 31, 38, 0.85)';
      const r = Math.max(1.6, Math.min(3.2, R / 900));
      for (const q of pts) {
        if (geoDistance(q, c) > Math.PI / 2) continue;
        const xy = projection(q);
        if (!xy) continue;
        ctx.beginPath();
        ctx.arc(xy[0], xy[1], r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (a) {
      // Drawn as a line (not a filled polygon) so ring winding order never matters.
      ctx.beginPath();
      path({ type: 'MultiLineString', coordinates: a.coordinates });
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(255, 106, 31, 0.3)';
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ff6a1f';
      ctx.stroke();
    }
    if (p && isFinite(p[0]) && isFinite(p[1]) && geoDistance(p, c) < Math.PI / 2) {
      const xy = projection(p);
      if (xy) drawPin(ctx, xy[0], xy[1]);
    }
  };

  // load outlines and imagery once; redraw on resize and when the theme changes
  useEffect(() => {
    let alive = true;
    loadWorld().then((w) => {
      if (!alive) return;
      world.current = w;
      draw();
    });
    loadTextures().then((t) => {
      if (!alive) return;
      tex.current = t;
      draw();
    });
    const ro = new ResizeObserver(draw);
    if (canvasRef.current) ro.observe(canvasRef.current);
    const mo = new MutationObserver(draw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      alive = false;
      ro.disconnect();
      mo.disconnect();
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
      moving.current = false;
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
      moving.current = t < 1;
      draw();
      if (t < 1) raf.current = requestAnimationFrame(step);
    };
    moving.current = true;
    raf.current = requestAnimationFrame(step);
    return () => {
      moving.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center[0], center[1], zoom]);

  useEffect(draw, [area, points, pin?.[0], pin?.[1], originY]); // eslint-disable-line react-hooks/exhaustive-deps

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
