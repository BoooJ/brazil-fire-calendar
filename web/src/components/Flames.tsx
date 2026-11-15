// Little animated flames scattered over the chosen area on the Standard and Satellite views.
// Decoration only: their places are random (geo.ts scatterIn), never data. Hidden from screen readers.
//
// The look: a small ball of fire with a white-hot core, wavy red tongues and a soft red bloom, plus a few glints.
// Flat colours only, softened by SVG blur, and a noise filter that bends the edges so they burn.
// The tongues and glints move with CSS (.flame in styles.css); the burning edge with SMIL, left out with reduced motion.

const still = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function svg(i: number): string {
  const id = `flm${i}`;
  const seed = (i * 7) % 97;
  const dur = (0.9 + ((i * 3) % 5) * 0.12).toFixed(2);
  const anim = still()
    ? ''
    : `<animate attributeName="baseFrequency" dur="${dur}s" repeatCount="indefinite" values="0.09 0.16;0.12 0.2;0.08 0.14;0.09 0.16"/>`;
  return (
    `<svg viewBox="0 0 40 40" aria-hidden="true">` +
    `<defs>` +
    // wavy, flickering edges
    `<filter id="${id}w" x="-30%" y="-30%" width="160%" height="160%">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.09 0.16" numOctaves="2" seed="${seed}" result="n">${anim}</feTurbulence>` +
    `<feDisplacementMap in="SourceGraphic" in2="n" scale="7" xChannelSelector="R" yChannelSelector="G" result="d"/>` +
    `<feGaussianBlur in="d" stdDeviation="0.7"/>` +
    `</filter>` +
    // the hot core: bent a little less, bloomed
    `<filter id="${id}c" x="-60%" y="-60%" width="220%" height="220%">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.14 0.2" numOctaves="1" seed="${seed + 3}" result="n">${anim}</feTurbulence>` +
    `<feDisplacementMap in="SourceGraphic" in2="n" scale="4" xChannelSelector="R" yChannelSelector="G" result="d"/>` +
    `<feGaussianBlur in="d" stdDeviation="1.1" result="b"/>` +
    `<feMerge><feMergeNode in="b"/><feMergeNode in="b"/></feMerge>` +
    `</filter>` +
    `<filter id="${id}h" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.2"/></filter>` +
    `</defs>` +
    // the bloom around it
    `<circle class="flame-halo" cx="20" cy="23" r="11" fill="#ff1e00" filter="url(#${id}h)"/>` +
    // tongues that rise off the ball and fade, then the ball: red, then orange, each a little lower
    `<g filter="url(#${id}w)">` +
    `<path class="flame-tongue t1" fill="#ff2a00" d="M13 17c-1.5-2.5-.5-5 1-6.5-.2 2 1 3 2 4z"/>` +
    `<path class="flame-tongue t2" fill="#ff3d00" d="M26 16c1.2-2.4.4-4.6-.8-6 .1 1.8-.9 2.8-1.8 3.6z"/>` +
    `<path class="flame-tongue t3" fill="#ff2a00" d="M20 10c-1-2.6 0-4.8 1.6-6-.3 2 .6 3.4 1.2 4.6z"/>` +
    `<path class="flame-out" fill="#ff2200" d="M20 6.5c2.2 3.6 9.5 6.2 9.5 14a9.5 9.5 0 0 1-19 0c0-7.8 7.3-10.4 9.5-14z"/>` +
    `<path class="flame-mid" fill="#ff6a00" d="M20 12.5c1.5 2.4 6 4 6 9.2a6 6 0 0 1-12 0c0-5.2 4.5-6.8 6-9.2z"/>` +
    `</g>` +
    // the white-hot core
    `<g filter="url(#${id}c)">` +
    `<path class="flame-hot" fill="#ffd27a" d="M20 15.5c1 1.8 4 3 4 6.6a4 4 0 0 1-8 0c0-3.6 3-4.8 4-6.6z"/>` +
    `<ellipse class="flame-core" cx="20" cy="23" rx="2.6" ry="3" fill="#fffaf0"/>` +
    `</g>` +
    // glints
    `<path class="flame-glint g1" fill="#fffbe8" d="M14.5 26.5l.5-1.9.5 1.9 1.9.5-1.9.5-.5 1.9-.5-1.9-1.9-.5z"/>` +
    `<path class="flame-glint g2" fill="#fffbe8" d="M25 13.5l.4-1.5.4 1.5 1.5.4-1.5.4-.4 1.5-.4-1.5-1.5-.4z"/>` +
    `</svg>`
  );
}

/** A flame as a DOM element, for MapLibre markers and the globe's overlay. `i` varies its size and rhythm. */
export function flameElement(i: number): HTMLElement {
  const el = document.createElement('span');
  el.className = 'flame';
  el.setAttribute('aria-hidden', 'true');
  const size = 24 + ((i * 7) % 4) * 3; // 24–33 px box; the ball is about half of it, the rest is glow
  el.style.setProperty('--fs', `${size}px`);
  el.style.setProperty('--fd', `${(i * 0.37) % 1.3}s`); // delay, so they don't move in step
  el.style.setProperty('--fr', `${1.1 + ((i * 3) % 5) * 0.15}s`); // speed
  el.innerHTML = svg(i);
  return el;
}
