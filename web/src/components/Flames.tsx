// Little animated flames scattered over the chosen area on the Standard and Satellite views.
// Decoration only: their places are random (geo.ts scatterIn), never data. Hidden from screen readers.
// The flicker is CSS (.flame in styles.css) and stops with reduced motion.

const SVG =
  '<svg viewBox="0 0 24 30" aria-hidden="true">' +
  '<path class="flame-out" fill="#f2682a" d="M12 1c1.2 4.2-1.8 6-3.6 8.4C6.5 11.8 5 14 5 17.4A7 7 0 0 0 12 29a7 7 0 0 0 7-7.4c0-2.6-1-4.3-2.3-5.9-.4 1.7-1.3 2.8-2.6 3.3C14.9 14.6 13.8 5.3 12 1z"/>' +
  '<path class="flame-mid" fill="#ffb347" d="M12 29a5 5 0 0 1-5-5c0-2.6 1.7-4.4 3.4-6.4.3 1.5 1 2.4 2 2.8-.3-2.4.3-4.6 1.7-6.3.6 2.6 2.9 4.6 2.9 8.2A5 5 0 0 1 12 29z"/>' +
  '<path class="flame-in" fill="#ffe08a" d="M12 29a2.8 2.8 0 0 1-2.8-2.8c0-1.5 1-2.6 2.8-4.4 1.8 1.8 2.8 2.9 2.8 4.4A2.8 2.8 0 0 1 12 29z"/>' +
  '</svg>';

/** A flame as a DOM element, for MapLibre markers and the globe's overlay. `i` varies its size and rhythm. */
export function flameElement(i: number): HTMLElement {
  const el = document.createElement('span');
  el.className = 'flame';
  el.setAttribute('aria-hidden', 'true');
  const size = 16 + ((i * 7) % 4) * 3; // 16–25 px
  el.style.setProperty('--fs', `${size}px`);
  el.style.setProperty('--fd', `${(i * 0.37) % 1.3}s`); // delay, so they don't flicker in step
  el.style.setProperty('--fr', `${0.9 + ((i * 3) % 5) * 0.12}s`); // speed
  el.innerHTML = SVG;
  return el;
}
