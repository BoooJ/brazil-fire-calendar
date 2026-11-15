/** The loading screen (#splash in index.html): the name in the middle until the page is really ready,
 *  then it fades away. Each page calls splashUntil() once with what it waits for; a hard cap makes sure
 *  a slow or failed load never keeps the visitor stuck behind it. */
const CAP_MS = 8000;
const MIN_MS = 600; // shown at least this long, so it never flickers
let started = false;

export function splashUntil(...waits: Promise<unknown>[]): void {
  if (started) return; // StrictMode runs effects twice
  started = true;
  const el = document.getElementById('splash');
  if (!el) return;
  const t0 = performance.now();
  const all = Promise.allSettled([...waits, document.fonts?.ready, pageLoaded()]);
  const cap = new Promise((r) => setTimeout(r, CAP_MS));
  Promise.race([all, cap]).then(() => {
    const wait = Math.max(0, MIN_MS - (performance.now() - t0));
    setTimeout(() => {
      // two frames: the page underneath has painted before we start the fade
      requestAnimationFrame(() => requestAnimationFrame(() => {
        el.classList.add('is-gone');
        el.addEventListener('transitionend', () => el.remove(), { once: true });
        setTimeout(() => el.remove(), 1000); // reduced motion: no transition, no transitionend
      }));
    }, wait);
  });
}

/** window "load": every image, stylesheet and script on the page has arrived */
function pageLoaded(): Promise<void> {
  return document.readyState === 'complete' ? Promise.resolve() : new Promise((r) => window.addEventListener('load', () => r(), { once: true }));
}

/** a picture has arrived (or failed: never wait on a broken one) */
export function imageReady(src: string): Promise<void> {
  return new Promise((r) => {
    const img = new Image();
    img.onload = img.onerror = () => r();
    img.src = src;
  });
}
