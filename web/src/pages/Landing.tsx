// The landing page: our sections and words, laid out with the design kit in public/assets/ (see landing/kit.ts)
// and illustrated with the product's own UI, drawn live from the data (landing/visuals.tsx).
import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import '../landing/landing.css';
import { getShowcase, type Showcase } from '../api';
import { applyKitAttributes, loadKitCss, startKit } from '../landing/kit';
import { AppFrame, HowAnswer, HowCalendar, HowPlace, RawVsCorrected, StepConvert, StepGrid, StepProvisional, Timeline } from '../landing/visuals';
import Globe from '../components/Globe';
import { Flame } from '../components/Brand';

applyKitAttributes(); // before the first paint: the kit's CSS reads these from <html>

const TOOL = '#/app';
const REPO = 'https://github.com/BoooJ/brazil-fire-calendar';

const TEAM = [
  ['Infrastructure', 'Data pipeline, API, daily updates'],
  ['UI / UX', 'Website, calendar, map, accessibility'],
  ['Science', 'Harmonization method and validation'],
];

const TOOLS = [
  ['NASA FIRMS', 'Active-fire hotspots: the only data source'],
  ['MODIS C6.1', 'Terra and Aqua, 1 km, since 2000'],
  ['VIIRS', 'S-NPP and NOAA-20, 375 m, since 2012'],
  ['Python · DuckDB · FastAPI', 'Data pipeline and API'],
  ['React · Vite · D3 · MapLibre · ECharts', 'This website, its globe, map and charts'],
  ['Claude Code', 'AI coding assistant used during the hackathon'],
];

const FAQ = [
  ['Where does the data come from?', 'Only NASA FIRMS: MODIS 6.1 and VIIRS 375 m hotspots. The map imagery and the country outlines on the globe are not used in any number.'],
  ['What is a fire-day?', 'A grid cell of about 1 km with at least one valid hotspot on one UTC day.'],
  ['Why are recent calendar months hatched?', 'They use near-real-time data, which NASA replaces with final data about five months later.'],
  ['Which areas does the calendar cover?', 'Your own location, a point with a radius, four ready-made regions of Brazil, or a rectangle or polygon you draw on the map.'],
  ['Does the calendar forecast fires?', 'No. What is normal for the coming months comes from past years and is labelled as history, not a forecast.'],
];

const Arrow = () => (
  <svg className="m-arrow" viewBox="0 0 12 12" aria-hidden="true">
    <path className="m-arrow__stem" d="M1 6h8" />
    <path className="m-arrow__head" d="M4.5 2.5 8 6l-3.5 3.5" />
  </svg>
);

const vars = (v: Record<string, string | number>) => v as CSSProperties;

export default function Landing() {
  const [styled, setStyled] = useState(false);
  const [show, setShow] = useState<Showcase | null>(null);

  useEffect(() => {
    let alive = true;
    loadKitCss().then(() => alive && setStyled(true));
    getShowcase().then((s) => alive && setShow(s)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // The kit's scripts look for their markup when they start, so they start once it is in the document.
  useEffect(() => {
    if (!styled) return;
    startKit();
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id && !id.startsWith('/')) document.getElementById(id)?.scrollIntoView();
  }, [styled]);

  if (!styled) return null;

  return (
    <>
      <header className="nav nav--centre">
        <div className="wrap nav__bar">
          <a className="skip-link" href="#top">Skip to content</a>
          <a className="nav__logo" href="#top"><Flame size={22} />Brazil Fire Calendar</a>
          <nav className="nav__links" aria-label="Main">
            <div className="nav__item"><a className="nav__link" href="#idea">The idea</a></div>
            <div className="nav__item"><a className="nav__link" href="#how">How it works</a></div>
            <div className="nav__item"><a className="nav__link" href="#method">Method</a></div>
            <div className="nav__item"><a className="nav__link" href="#questions">Questions</a></div>
            <div className="nav__item"><a className="nav__link" href="#team">Team</a></div>
          </nav>
          <div className="nav__actions">
            <a className="btn btn--primary" href={TOOL}>Open the tool</a>
          </div>
          <button className="nav__toggle" type="button" aria-expanded="false" aria-label="Menu">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M2 5h14M2 13h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </div>
      </header>

      <main id="top">
        {/* 1. the name, the promise, the globe */}
        <section className="hero hero--globe" data-enter aria-labelledby="hero-h">
          <div className="bfc-globe" data-enter-media aria-hidden="true">
            <Globe label="" zoom={1.35} />
          </div>
          <div className="wrap">
            <div className="hero-text hero-split grid">
              <div className="hero-copy span-7">
                <a className="pill" href="#idea"><span>Space Apps 2026</span><span className="muted">MODIS + VIIRS, one record</span></a>
                <h1 id="hero-h">Brazil Fire Calendar</h1>
                <p className="hero__lead">
                  Twenty years of NASA fire detections over Brazil, turned into one burning calendar for the place you care about.
                  See when fires usually come, whether this month is unusual, and which months are critical.
                </p>
                <div className="btn-row">
                  <a className="btn btn--primary" href={TOOL}>See the calendar for my area<Arrow /></a>
                  <a className="btn btn--secondary" href="#how">How it works</a>
                </div>
                <dl className="hero-facts bfc-hero-facts">
                  <div><dt>Every month since</dt><dd>January 2003</dd></div>
                  <div><dt>Four satellites</dt><dd>MODIS and VIIRS</dd></div>
                  <div><dt>One source</dt><dd>NASA FIRMS</dd></div>
                </dl>
              </div>
            </div>
          </div>
        </section>

        {/* 2. the idea, with the four satellites on one time line */}
        <section className="section" id="idea" aria-labelledby="idea-h">
          <div className="wrap">
            <div className="grid fill">
              <div className="span-5 stack-6">
                <p className="bfc-eyebrow">The idea</p>
                <h2 id="idea-h">Satellites change. Your fire history doesn’t.</h2>
                <p className="t-lead">
                  MODIS has watched Brazil since 2000 at 1 km. The sharper VIIRS sensors joined in 2012 at 375 m and
                  spot many more small fires. Left raw, every new satellite looks like a worse fire season. We put them
                  all on one scale, so a jump in the calendar means a change on the ground.
                </p>
                <p className="bfc-facts">VIIRS S-NPP stopped on 2 November 2026.<br />VIIRS NOAA-20 is the scale every count is converted to.</p>
                <a className="link" href="#method">See the conversion method</a>
              </div>
              <div className="frame frame--split frame--lit span-6 start-7" data-visual>
                <div className="stage"><Timeline /></div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. the statement, with raw against corrected */}
        <section className="section" id="statement" aria-labelledby="statement-h">
          <div className="wrap">
            <div data-moment="liquid-type">
              <h2 id="statement-h" className="mo-lt__type">Real change, not sensor change</h2>
            </div>
            <div className="grid grid--top bfc-stmt">
              <p className="span-5">
                Every detection becomes a <strong className="bfc-nowrap">fire-day</strong>: a 1 km square that burned on a given day, counted
                once and converted to the NOAA-20 scale. So 2005 and 2025 sit side by side, and the comparison is fair.
              </p>
              <div className="frame frame--lit span-6 start-7 bfc-rc-frame" data-visual>
                <div className="stage"><RawVsCorrected show={show} /></div>
              </div>
            </div>
          </div>
        </section>

        {/* 4. three steps, over the calendar itself */}
        <section className="section" id="how" aria-labelledby="how-h">
          <div className="wrap">
            <div className="section-head">
              <p className="bfc-eyebrow">How it works</p>
              <h2 id="how-h">Your fire calendar in three steps</h2>
            </div>
            <ol className="grid bfc-how">
              <li className="span-4 bfc-folder">
                <div className="bfc-folder__img"><HowPlace /></div>
                <div className="bfc-folder__txt"><span className="step-num">1</span><h3>Pick your area</h3><p>Your location, a point with a radius, a ready-made region of Brazil, or a shape you draw on the map.</p></div>
              </li>
              <li className="span-4 bfc-folder">
                <div className="bfc-folder__img"><HowAnswer show={show} /></div>
                <div className="bfc-folder__txt"><span className="step-num">2</span><h3>See if this month is unusual</h3><p>One line: is fire activity above or below a typical month here?</p></div>
              </li>
              <li className="span-4 bfc-folder">
                <div className="bfc-folder__img"><HowCalendar show={show} /></div>
                <div className="bfc-folder__txt"><span className="step-num">3</span><h3>Find the critical months</h3><p>Every month since 2003: the usual season, its peak, the odd years.</p></div>
              </li>
            </ol>
          </div>
        </section>

        {/* 5. the call to action */}
        <section className="section" id="start" aria-labelledby="start-h">
          <div className="wrap">
            <div className="bfc-cta fill" data-fx="grain-gradient" data-fx-seed="5"
              data-fx-palette='{"bg":"#ff6a1f","surface":"#ffb347","ink":"#1c0700","muted":"#4a1a00","accent":"#c81d25"}'
              data-fx-params='{"calmX":0.5,"calmY":0.5,"calm":0.7,"tint":0.7}'>
              <div className="bfc-cta__in">
                <h2 id="start-h">When does your area usually burn?</h2>
                <p>One tap to find out. No account, and your location stays in your browser.</p>
                <a className="btn btn--primary" href={TOOL}>Open the fire calendar<Arrow /></a>
              </div>
            </div>
          </div>
        </section>

        {/* 6. why, with the tool in a frame */}
        <section className="section ground-inverse" id="tool" aria-labelledby="tool-h">
          <div className="wrap">
            <div className="grid">
              <div className="span-5">
                <p className="bfc-eyebrow">Motivation</p>
                <h2 id="tool-h">Built for people who plan around fire</h2>
              </div>
              <div className="span-6 start-7 stack-4">
                <p>
                  Early-warning services, scientists and land managers ask the same questions about wildfires and
                  agricultural burning: is this season unusual, and when are the critical months? The answers are in public
                  satellite data, but split across instruments that don’t agree.
                </p>
                <p>
                  Everything here is history. Recent months are marked provisional, weak numbers uncertain, and what is
                  typical for the coming months is always labelled as history, <strong>not a forecast</strong>.
                </p>
              </div>
            </div>
            <AppFrame show={show} />
          </div>
        </section>

        {/* 7. the method */}
        <section className="section" id="method" style={vars({ '--hm': 2 })} aria-labelledby="method-h">
          <div className="wrap">
            <div className="section-head">
              <h2 id="method-h">How the years stay comparable</h2>
            </div>
            <div className="grid">
              <article className="card card--row card--open m-nolift span-4">
                <span className="step-num">1</span>
                <h3>Count fire-days, not hotspots</h3>
                <p>Many hotspots in one 1 km cell on one day count once, so a sharper sensor can’t inflate the total.</p>
                <div className="panel" data-fx="grain-gradient" data-fx-seed="11"><StepGrid /></div>
              </article>
              <article className="card card--row card--open m-nolift span-4">
                <span className="step-num">2</span>
                <h3>Put every satellite on one scale</h3>
                <p>Months seen by two satellites at once set the conversion to NOAA-20; held-out years check it.</p>
                <div className="panel" data-fx="grain-gradient" data-fx-seed="23"><StepConvert /></div>
              </article>
              <article className="card card--row card--open m-nolift span-4">
                <span className="step-num">3</span>
                <h3>Flag months that may still change</h3>
                <p>NASA replaces near-real-time data with final data about five months later. Until then the month is hatched as provisional.</p>
                <div className="panel" data-fx="grain-gradient" data-fx-seed="37"><StepProvisional show={show} /></div>
              </article>
            </div>
            <div className="btn-row bfc-method-act"><a className="btn btn--secondary" href={REPO}>Read the source code</a></div>
          </div>
        </section>

        {/* 8. questions */}
        <section className="section" id="questions" aria-labelledby="questions-h">
          <div className="wrap">
            <div className="grid grid--top fill">
              <div className="span-5 stack-4">
                <h2 id="questions-h">Questions</h2>
                <p className="bfc-q-lede">About the data, the method and the downloads.</p>
              </div>
              <div className="faq span-6 start-7">
                {FAQ.map(([q, a]) => <div className="faq__item" key={q}><h3>{q}</h3><p>{a}</p></div>)}
              </div>
            </div>
          </div>
        </section>

        {/* 9. team and tools */}
        <section className="section" id="team" aria-labelledby="team-h">
          <div className="wrap">
            <div className="grid grid--top fill">
              <div className="span-5">
                <p className="bfc-eyebrow">Team</p>
                <h2 id="team-h">Who built it</h2>
                <ul className="bfc-list">{TEAM.map(([a, b]) => <li key={a}><strong>{a}</strong><span>{b}</span></li>)}</ul>
              </div>
              <div className="span-6 start-7">
                <p className="bfc-eyebrow">Tools</p>
                <h2>What we used</h2>
                <ul className="bfc-list">{TOOLS.map(([a, b]) => <li key={a}><strong>{a}</strong><span>{b}</span></li>)}</ul>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* 10. the close and the credits */}
      <footer className="footer closing footer--statement" id="contact" style={vars({ '--hm': 2 })} aria-labelledby="close-h">
        <div className="wrap">
          <div className="closing__cta close--word">
            <div className="section-head--split">
              <div>
                <h2 id="close-h">See your area’s fire calendar</h2>
                <p className="t-lead">Free, no account. Every number comes from NASA FIRMS.</p>
              </div>
              <a className="btn btn--primary" href={TOOL}>See the fire calendar<Arrow /></a>
            </div>
            <p className="close__word" aria-hidden="true">Brazil Fire Calendar</p>
          </div>
          <div className="closing__links">
            <div className="grid">
              <div className="span-4 stack-4">
                <a className="nav__logo" href="#top"><Flame size={22} />Brazil Fire Calendar</a>
                <p className="footer__lede">NASA fire hotspots for Brazil on one scale, built for the NASA Space Apps Challenge 2026.</p>
              </div>
              <div className="span-2 start-7 footer__col"><h3>Site</h3><ul><li><a href="#idea">The idea</a></li><li><a href="#how">How it works</a></li><li><a href="#method">Method</a></li><li><a href="#questions">Questions</a></li></ul></div>
              <div className="span-2 start-9 footer__col"><h3>Data</h3><ul><li><a href="https://firms.modaps.eosdis.nasa.gov/">NASA FIRMS</a></li><li><a href="https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api">NASA GIBS</a></li><li><a href="https://www.naturalearthdata.com/">Natural Earth</a></li></ul></div>
              <div className="span-2 start-11 footer__col"><h3>Project</h3><ul><li><a href={REPO}>Read the source code</a></li></ul></div>
            </div>
            <div className="footer__legal">
              <div className="bfc-credits">
                <p>
                  Fire data: NASA FIRMS (Fire Information for Resource Management System), MODIS Collection 6.1 and VIIRS
                  375 m active fire products. We acknowledge the use of data from NASA FIRMS, part of NASA Earth Science
                  Data and Information System (ESDIS).
                </p>
                <p>Map imagery: NASA GIBS. Country outlines on the globe: Natural Earth, public domain. Both are used for display only, never for the numbers.</p>
                <p>Built for the NASA Space Apps Challenge 2026. Not an official NASA product.</p>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* the phone's action bar: the kit looks for it directly under <body> */}
      {createPortal(
        <nav className="actionbar" aria-label="Quick actions">
          <a className="btn btn--primary" href={TOOL}>See the fire calendar</a>
        </nav>,
        document.body,
      )}
    </>
  );
}
