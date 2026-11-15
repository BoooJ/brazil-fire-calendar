// Little animated flames scattered over the chosen area on the Standard and Satellite views.
// Decoration only: their places are random (geo.ts scatterIn), never data. Hidden from screen readers.
// The flicker is CSS (.flame in styles.css) and stops with reduced motion.

// A round, soft flame: a ball with a short tip, in flat layers (red-orange, orange, yellow, a pale core),
// each layer a little lower than the one around it so the ball reads as glowing from the bottom.
const SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true">' +
  '<g class="flame-body">' +
  '<path class="flame-out" fill="#f2682a" d="M12 2.5C13.6 5.8 20 8.4 20 15a8 8 0 0 1-16 0c0-6.6 6.4-9.2 8-12.5z"/>' +
  '<path class="flame-mid" fill="#ffb347" d="M12 8c1.1 2.2 5 3.6 5 8a5 5 0 0 1-10 0c0-4.4 3.9-5.8 5-8z"/>' +
  '<path class="flame-in" fill="#ffe08a" d="M12 12.4c.8 1.5 2.9 2.4 2.9 4.9a2.9 2.9 0 0 1-5.8 0c0-2.5 2.1-3.4 2.9-4.9z"/>' +
  '<circle class="flame-core" fill="#fff8e1" cx="12" cy="18.3" r="1.3"/>' +
  '</g>' +
  '</svg>';

/** A flame as a DOM element, for MapLibre markers and the globe's overlay. `i` varies its size and rhythm. */
export function flameElement(i: number): HTMLElement {
  const el = document.createElement('span');
  el.className = 'flame';
  el.setAttribute('aria-hidden', 'true');
  const size = 13 + ((i * 7) % 4) * 2; // 13–19 px
  el.style.setProperty('--fs', `${size}px`);
  el.style.setProperty('--fd', `${(i * 0.37) % 1.3}s`); // delay, so they don't flicker in step
  el.style.setProperty('--fr', `${1.3 + ((i * 3) % 5) * 0.15}s`); // speed
  el.innerHTML = SVG;
  return el;
}
