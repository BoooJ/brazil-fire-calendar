// Loader for the landing page's design kit: the files in public/assets/ (tasteskill, MIT), used as they are.
// The kit is written for a plain HTML page: stylesheets linked in <head>, attributes on <html>, and scripts
// that find their markup when they load. This module gives it the same on our React page:
//   1. applyKitAttributes()  the <html> attributes and classes the kit's CSS reads, before the first paint
//   2. loadKitCss()          the stylesheets, placed first in <head> so landing.css can set the palette after them
//   3. startKit()            the scripts, once the page's markup is in the document
// The landing page never shares a document with the tool (App.tsx reloads between them), so nothing is undone.

const asset = (path: string) => new URL(`assets/${path}`, document.baseURI).href;

const STYLESHEETS = [
  'system.css',
  'ui/cards.css',
  'motion/motion.css',
  'backgrounds/backgrounds.css',
  'layout/layout.css',
  'icons/icon.css',
  'ui/base.css',
];

/** What the kit calls the page's deal: software page, soft corners, the "painting" lit ground, pill buttons. */
export function applyKitAttributes() {
  const html = document.documentElement;
  Object.assign(html.dataset, { type: 'software', radius: 'soft', ground: 'painting', buttons: 'pill' });
  if (!html.hasAttribute('data-motion')) html.setAttribute('data-motion', '');
  if (!document.querySelector('meta[name="site-kind"]')) {
    const meta = document.createElement('meta');
    meta.name = 'site-kind';
    meta.content = 'software';
    document.head.append(meta);
  }
  // the hero's entrance (motion.js): its words wait for the script, at most 700 ms
  html.classList.add('m-enter');
  setTimeout(() => html.classList.add('m-enter-done'), 700);
}

let css: Promise<void> | null = null;
export function loadKitCss(): Promise<void> {
  css ??= new Promise<void>((resolve) => {
    let left = STYLESHEETS.length;
    const done = () => --left === 0 && resolve();
    const links = STYLESHEETS.map((path) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = asset(path);
      link.onload = link.onerror = done;
      return link;
    });
    document.head.prepend(...links);
    setTimeout(resolve, 4000); // never keep the page blank for a slow stylesheet
  });
  return css;
}

function classicScript(path: string): Promise<void> {
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = asset(path);
    s.onload = s.onerror = () => resolve();
    document.head.append(s);
  });
}

let started: Promise<void> | null = null;
/** Starts the kit's scripts. Call it once the landing page's markup is in the document. */
export function startKit(): Promise<void> {
  started ??= (async () => {
    const html = document.documentElement;
    await classicScript('backgrounds/backgrounds.js'); // reads the palette, sets data-mode and the tint strengths
    html.classList.add('mo-js');
    setTimeout(() => html.classList.add('mo-safe'), 2500);
    // the same order as on a plain page: system, then motion, then layout. Each starts by itself.
    for (const path of ['system.js', 'motion/motion.js', 'layout/layout.js']) {
      try {
        await import(/* @vite-ignore */ asset(path));
      } catch (e) {
        console.warn(`design kit: ${path} did not load`, e);
      }
    }
    await moveGrounds();
  })();
  return started;
}

/**
 * The kit lets one ground move, the hero's, and draws every other one once. Our hero holds the globe, so the
 * painted ground that moves sits further down: an element marked data-fx-moving="<effect>" is mounted here
 * the way the kit mounts its hero's ground (it runs only on screen, and gets the kit's pause button).
 * Landing.tsx marks it so only where the kit itself would let it move: not on a phone, not under reduced motion.
 */
async function moveGrounds() {
  const grounds = [...document.querySelectorAll<HTMLElement>('[data-fx-moving]')];
  if (!grounds.length) return;
  try {
    const [{ default: fx }, { default: ui }] = await Promise.all([
      import(/* @vite-ignore */ asset('effects/fx.js')),
      import(/* @vite-ignore */ asset('ui/ui.js')),
    ]);
    for (const el of grounds) {
      const control = await fx.mount(el, el.dataset.fxMoving, { palette: fx.readPalette(el), seed: el.dataset.fxSeed });
      ui.pausable(el, control);
    }
  } catch (e) {
    console.warn('design kit: the moving ground did not start', e);
  }
}

/** Where the kit lets a ground move by itself: a wide screen, and no "reduce motion" setting. */
export const groundsMayMove = () =>
  !window.matchMedia('(max-width: 639px)').matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
