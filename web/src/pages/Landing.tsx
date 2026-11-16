// The landing page: our own light, flat stylesheet (landing/landing.css), real screenshots of the tool
// (landing/pictures/) and a few data pictures drawn live from the API (landing/visuals.tsx).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import '../landing/landing.css';
import { getShowcase, type Showcase } from '../api';
import { RawVsCorrected, StepConvert, StepGrid, StepProvisional, Timeline } from '../landing/visuals';
import { Flame } from '../components/Brand';
import shotHero from '../landing/pictures/hero.png';
import shotHow1 from '../landing/pictures/how-1.png';
import shotHow2 from '../landing/pictures/how-2.png';
import shotHow3 from '../landing/pictures/how-3.png';
import shotTool from '../landing/pictures/tool.png';
import teamPhoto from '../landing/pictures/team.jpg';
import heroVideo from '../landing/media/hero.mp4';
import heroVideoSmall from '../landing/media/hero-720.mp4';
import heroPoster from '../landing/media/hero-poster.jpg';
import { imageReady, splashUntil } from '../splash';

const TOOL = '#/app';
const REPO = 'https://github.com/BoooJ/brazil-fire-calendar';

const NAV = [
  ['#idea', 'The idea'],
  ['#how', 'How it works'],
  ['#method', 'Method'],
  ['#questions', 'Questions'],
  ['#team', 'Team'],
];

const TOOLS = [
  ['NASA FIRMS', 'Active-fire detections, the only data behind the numbers'],
  ['MODIS', 'Terra, 1 km, watching since 2000'],
  ['VIIRS', 'NOAA-20, 375 m, since 2018'],
  ['Python · DuckDB · FastAPI', 'The data pipeline and the API'],
  ['React · MapLibre · ECharts', 'This website, its map and charts'],
  ['Claude Code', 'AI coding assistant used during the hackathon'],
];

// The four of us: name, what each did, what each brought (the team's own words, 15 Nov)
const PEOPLE = [
  ['Mikhail', 'Team lead · Front end, UI/UX', 'Led and managed the team, designed the UI and UX, built the front end and brought the final product together.'],
  ['Paul', 'Back end', 'Built the back end and integrated the machine-learning model into the interface.'],
  ['Andrey', 'Machine learning · Astrophysics', 'Built and trained from scratch the machine-learning model that estimates next week’s fire chance, and brought astrophysics expertise to the project.'],
  ['Marcia', 'Mathematics', 'Brought mathematical expertise, and helped develop and integrate the machine-learning model.'],
];

const FAQ = [
  ['Where does the data come from?', 'NASA FIRMS, and nothing else: MODIS and VIIRS active-fire detections. The map imagery and country outlines only help you find your way. A state’s border only sets which area is counted; every number comes from NASA FIRMS.'],
  ['Does it predict fires?', 'It estimates, it doesn’t promise. The calendar shows when fire usually comes to your area, from 23 years of what happened, and an experimental model gives the chance of fire next week. Neither is an official warning.'],
  ['What exactly do you count?', 'We count each 1 km square once for every day a satellite saw fire in it. That tracks fire activity, not burned area or damage.'],
  ['Why are recent months marked provisional?', 'They use NASA’s near-real-time data, which is replaced by final data a few months later. Those numbers can still shift a little.'],
  ['Which areas can I look at?', 'Any Brazilian state, your own location, a point with a radius, or a shape you draw on the map.'],
  ['Can it be wrong?', 'Yes. Satellites miss fires under cloud and thick smoke, and converting between sensors has a margin of error. The tool tells you how big that margin is.'],
];

const Arrow = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 8h10M9 4l4 4-4 4" />
  </svg>
);
const Chevron = () => (
  <svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3l5 5-5 5" />
  </svg>
);

/** The start button: an ink block with an ember square. On hover the ember floods the button and chevrons march right. */
function Go({ children, small }: { children: ReactNode; small?: boolean }) {
  return (
    <a className={'l-go' + (small ? ' l-go--s' : '')} href={TOOL}>
      <span className="l-go__sq" aria-hidden="true">
        <span className="l-go__arrow"><Arrow /></span>
        <span className="l-go__chev">{Array.from({ length: 5 }, (_, i) => <Chevron key={i} />)}</span>
      </span>
      <span className="l-go__label">{children}</span>
    </a>
  );
}

// GitHub's mark, monochrome, sized to the text (links to the repository only)
const GitHubMark = () => (
  <svg className="l-gh" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

/** A folder card: the picture sits behind a folder face (tab, big number); on hover or focus the face slides
 *  down and shows it. On touch screens and with reduced motion the picture is simply shown. */
function Folder({ n, title, text, children, label }: { n: string; title: string; text: string; children: ReactNode; label: string }) {
  return (
    <li className="l-fold" tabIndex={0} aria-label={`${title}. ${text} Picture: ${label}`}>
      <div className="l-fold__pic">{children}</div>
      <div className="l-fold__face" aria-hidden="true"><b>{n}</b></div>
      <div className="l-fold__txt" aria-hidden="true"><h3>{title}</h3><p>{text}</p></div>
    </li>
  );
}

/** The hero's background film: muted, looping nonstop, behind a flat dark scrim. It always starts by itself,
 *  also with reduced motion (team decision). Browsers that still block autoplay (e.g. iPhone Low Power Mode)
 *  get it started on the first touch, scroll or key. Decoration only, no data. */
function HeroVideo({ onReady }: { onReady: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    // muted must be set as a property before playing, or some browsers refuse to autoplay
    v.muted = true;
    v.defaultMuted = true;
    v.setAttribute('muted', '');
    v.src = window.matchMedia('(max-width: 900px)').matches ? heroVideoSmall : heroVideo;

    // ready for the loading screen = the film is moving; where autoplay is blocked, its first frame is there
    const playing = () => onReady();
    const blocked = () => (v.readyState >= 2 ? onReady() : v.addEventListener('loadeddata', onReady, { once: true }));
    v.addEventListener('playing', playing);
    v.addEventListener('error', playing); // a broken film never holds the page back
    const kick = () => {
      if (v.paused) v.play().catch(blocked);
    };
    const events = ['pointerdown', 'touchstart', 'scroll', 'keydown'] as const;
    const onFirst = () => {
      kick();
      if (!v.paused) events.forEach((e) => window.removeEventListener(e, onFirst));
    };
    const onVisible = () => document.visibilityState === 'visible' && kick();

    kick();
    v.addEventListener('canplay', kick);
    v.addEventListener('pause', kick); // e.g. the OS paused it: start again (it never stops on purpose)
    events.forEach((e) => window.addEventListener(e, onFirst, { passive: true }));
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      v.removeEventListener('playing', playing);
      v.removeEventListener('error', playing);
      v.removeEventListener('loadeddata', onReady);
      v.removeEventListener('canplay', kick);
      v.removeEventListener('pause', kick);
      events.forEach((e) => window.removeEventListener(e, onFirst));
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [onReady]);

  return (
    <div className="l-hero__media" aria-hidden="true">
      <video ref={ref} className="l-hero__video" poster={heroPoster} autoPlay muted loop playsInline preload="auto" tabIndex={-1} disablePictureInPicture />
      <div className="l-hero__scrim" />
    </div>
  );
}

// resolved once the hero film is on screen (see HeroVideo): the loading screen waits for it
let filmReady: () => void = () => {};
const film = new Promise<void>((r) => (filmReady = r));

export default function Landing() {
  const [show, setShow] = useState<Showcase | null>(null);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    let alive = true;
    const showcase = getShowcase().then((s) => alive && setShow(s)).catch(() => {});
    // the loading screen stays until the film runs, its poster, the data pictures and the page's images are in
    splashUntil(film, imageReady(heroPoster), showcase);
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id && !id.startsWith('/')) document.getElementById(id)?.scrollIntoView({ behavior: 'instant' });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menu]);

  return (
    <div className="l-page">
      <a className="l-skip" href="#top">Skip to content</a>
      <header className={'l-nav' + (menu ? ' is-open' : '')}>
        <div className="l-wrap l-nav__bar">
          <a className="l-logo" href="#top"><Flame size={20} />Brazil Fire Calendar</a>
          <nav className="l-nav__links" id="l-menu" aria-label="Main">
            {NAV.map(([href, label]) => <a key={href} href={href} onClick={() => setMenu(false)}>{label}</a>)}
          </nav>
          <Go small>Open the calendar</Go>
          <button className="l-nav__toggle" type="button" aria-expanded={menu} aria-controls="l-menu" aria-label="Menu" onClick={() => setMenu(!menu)}>
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d={menu ? 'M4 4l10 10M14 4L4 14' : 'M2 5.5h14M2 12.5h14'} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </div>
      </header>

      <main id="top">
        {/* 1. the promise, with the product itself as the picture */}
        <section className="l-hero" aria-labelledby="hero-h">
          <HeroVideo onReady={filmReady} />
          <div className="l-wrap l-hero__text">
            <p className="l-eyebrow">NASA Space Apps 2026 · Two satellites, one fire record</p>
            <h1 id="hero-h">There’s a wildfire in your area.</h1>
            <p className="l-lead l-hero__lead">
              Maybe not today. But we estimated when. 23 years of NASA satellite fire detections over Brazil, showing
              the history of fire in your area, its intensity, and what to expect in the future.
            </p>
            <div className="l-row">
              <Go>Check my area</Go>
              <a className="l-btn" href="#how">How it works</a>
            </div>
          </div>
        </section>

        <section className="l-hero-more" aria-label="The tool">
          <div className="l-wrap">
            <figure className="l-shot l-hero__shot">
              <img src={shotHero} alt="The Brazil Fire Calendar tool: this month’s fire activity against a typical month, three quick answers, a typical year with the coming months, and the chosen state on the globe." width="2160" height="1350" />
            </figure>
            <dl className="l-facts">
              <div><dt>Analysed weekly since</dt><dd>January 2003</dd></div>
              <div><dt>Satellite data integrated</dt><dd>VIIRS and MODIS</dd></div>
              <div><dt>Data source</dt><dd>NASA FIRMS</dd></div>
            </dl>
          </div>
        </section>

        {/* 2. the idea: the two satellites on one time line, above what they reported against our one record */}
        <section className="l-sec l-sec--band" id="idea" aria-labelledby="idea-h">
          <div className="l-wrap l-split">
            <div className="l-col">
              <p className="l-eyebrow">The idea</p>
              <h2 id="idea-h"><span>A harmonized dataset</span> from two different instruments.</h2>
              <p className="l-body">
                NASA has monitored active fires over Brazil since the year 2000 with the MODIS sensor aboard the
                Terra satellite. In 2012, the VIIRS sensor joined the record. MODIS has a nominal spatial resolution
                of 1 km at nadir; VIIRS achieves 375 m, a pixel about seven times smaller in area, and therefore
                registers many small and low-intensity fires below the MODIS detection threshold. Combined without
                correction, the two records show an apparent rise in fire activity that reflects the change of
                sensor, not a change on the ground. We therefore harmonize both onto a single scale, expressed in
                VIIRS NOAA-20 equivalents. In the chart, the bars show the detections each sensor reported per year;
                the step in 2018 marks the start of VIIRS observations from the NOAA-20 satellite.
              </p>
              <a className="l-link" href="#method">How we do it<Arrow /></a>
            </div>
            <div className="l-card l-card--white l-col l-duo">
              <Timeline />
              <RawVsCorrected show={show} record={false} />
            </div>
          </div>
        </section>

        {/* 3. three steps, each with the real screen behind a folder face */}
        <section className="l-sec" id="how" aria-labelledby="how-h">
          <div className="l-wrap">
            <p className="l-eyebrow">How it works</p>
            <h2 id="how-h"><span>Three steps</span> to your fire calendar.</h2>
            <ol className="l-folds">
              <Folder n="01" title="Choose your area" text="A state, your own location, a point with a radius, or a shape you draw on the map." label="the tool’s location step.">
                <img src={shotHow1} alt="" loading="lazy" />
              </Folder>
              <Folder n="02" title="Get the short answer" text="Is fire here running above or below normal for this time of year? One line tells you." label="the tool’s one-line answer for the chosen area.">
                <img src={shotHow2} alt="" loading="lazy" />
              </Folder>
              <Folder n="03" title="Read the calendar" text="Every week since 2003, coloured by how much fire satellites saw. The season, its peak and the unusual years stand out." label="the tool’s burning calendar.">
                <img src={shotHow3} alt="" loading="lazy" />
              </Folder>
            </ol>
          </div>
        </section>

        {/* 4. the call to action */}
        <section className="l-sec l-sec--tight" id="start" aria-labelledby="start-h">
          <div className="l-wrap">
            <div className="l-cta">
              <h2 id="start-h">When does your area burn?</h2>
              <p className="l-lead">Find out in under a minute. No account, and we never store your location.</p>
              <Go>Open the calendar</Go>
            </div>
          </div>
        </section>

        {/* 5. who it is for, with the tool in a frame */}
        <section className="l-sec" id="tool" aria-labelledby="tool-h">
          <div className="l-wrap">
            <div className="l-split l-split--top">
              <div className="l-col">
                <p className="l-eyebrow">Who it’s for</p>
                <h2 id="tool-h"><span>For people who</span> plan around fire.</h2>
              </div>
              <div className="l-col l-stack">
                <p className="l-body">
                  Early-warning teams deciding when to be on alert. Scientists who need a record that doesn’t break
                  when a satellite does. Farmers and land managers timing burns and firebreaks. They all ask the
                  same two things: is this normal, and when is it worst?
                </p>
                <p className="l-body">
                  The calendar is history, <strong>not a forecast</strong>. Recent months stay marked provisional
                  until NASA finalises them. The one look ahead, next week’s fire chance, is an experimental model
                  estimate and always says so.
                </p>
              </div>
            </div>
            <figure className="l-shot l-tool__shot">
              <img src={shotTool} alt="The tool’s burning calendar for one area: a row per year, a coloured brick per month, next to the map." loading="lazy" width="2160" height="1350" />
            </figure>
          </div>
        </section>

        {/* 6. the method */}
        <section className="l-sec l-sec--band" id="method" aria-labelledby="method-h">
          <div className="l-wrap">
            <p className="l-eyebrow">Method</p>
            <h2 id="method-h"><span>How we keep</span> the years comparable.</h2>
            <div className="l-steps">
              <article className="l-card l-card--white">
                <div className="l-steps__pic"><StepGrid /></div>
                <h3>Count places that burned, not detections</h3>
                <p>A sharp sensor can report one fire many times. We count each 1 km square once per day it burned (one “hotspot”), so sharper eyes can’t inflate the total.</p>
              </article>
              <article className="l-card l-card--white">
                <div className="l-steps__pic"><StepConvert /></div>
                <h3>Put every satellite on one scale</h3>
                <p>When two satellites watched the same months, we measure how their counts relate and convert everything to NOAA-20. We test the result on years we held back.</p>
              </article>
              <article className="l-card l-card--white">
                <div className="l-steps__pic"><StepProvisional show={show} /></div>
                <h3>Mark what may still change</h3>
                <p>NASA’s first numbers are near-real-time, replaced by final data a few months later. Until then the month is marked provisional.</p>
              </article>
            </div>
            <a className="l-btn l-src" href={REPO}><GitHubMark />Source code</a>
          </div>
        </section>

        {/* 7. questions */}
        <section className="l-sec" id="questions" aria-labelledby="questions-h">
          <div className="l-wrap l-split l-split--top">
            <div className="l-col">
              <p className="l-eyebrow">Questions</p>
              <h2 id="questions-h"><span>Fair questions,</span> straight answers.</h2>
            </div>
            <div className="l-col l-faq">
              {FAQ.map(([q, a]) => <div key={q}><h3>{q}</h3><p>{a}</p></div>)}
            </div>
          </div>
        </section>

        {/* 8. the team (our photo beside who brought what), its three crafts, and the tools */}
        <section className="l-sec l-sec--band" id="team" aria-labelledby="team-h">
          <div className="l-wrap">
            <div className="l-split l-split--top">
              <div className="l-col">
                <p className="l-eyebrow">Team</p>
                <h2 id="team-h"><span>Who we are.</span> Four people, three crafts, one calendar.</h2>
              </div>
              <p className="l-col l-body">
                Brazil Fire Calendar was built in one weekend at the NASA Space Apps Challenge 2026 in
                Florianópolis. Here is what each of us brought to the table.
              </p>
            </div>
            <div className="l-split l-team">
              <figure className="l-col l-team__photo">
                <img src={teamPhoto} alt="The four team members side by side on a terrace, in NASA Space Apps Challenge Florianópolis 2026 T-shirts, with the sea and hills behind them." loading="lazy" decoding="async" width="1200" height="1600" />
              </figure>
              <ul className="l-col l-people">
                {PEOPLE.map(([name, role, text]) => (
                  <li key={name}>
                    <div className="l-people__name"><h3>{name}</h3><span>{role}</span></div>
                    <p>{text}</p>
                  </li>
                ))}
              </ul>
            </div>
            <ul className="l-folds">
              <Folder n="01" title="Infrastructure" text="Cleans more than 41 million NASA detections and serves any area of Brazil in seconds." label="satellite detections per year and the single record built from them.">
                <div className="l-fold__live"><RawVsCorrected show={show} /></div>
              </Folder>
              <Folder n="02" title="UI / UX" text="The calendar, the map and the words. Made to be read at a glance, by everyone." label="the tool’s burning calendar.">
                <img src={shotHow3} alt="" loading="lazy" />
              </Folder>
              <Folder n="03" title="Science" text="The method that puts two satellites on one scale, and the checks that keep it honest." label="two satellites converted to one scale.">
                <div className="l-fold__live"><StepConvert /></div>
              </Folder>
            </ul>
            <div className="l-split l-split--top l-tools">
              <div className="l-col"><h3 className="l-h3">What we built it with</h3></div>
              <ul className="l-col l-list">{TOOLS.map(([a, b]) => <li key={a}><strong>{a}</strong><span>{b}</span></li>)}</ul>
            </div>
          </div>
        </section>
      </main>

      {/* 9. the close and the credits */}
      <footer className="l-foot" aria-labelledby="close-h">
        <div className="l-wrap">
          <div className="l-foot__cta">
            <div>
              <h2 id="close-h">See your area’s fire calendar.</h2>
              <p className="l-lead">Free, no account. Every number comes from NASA FIRMS.</p>
            </div>
            <Go>Open the calendar</Go>
          </div>
          <div className="l-foot__cols">
            <div className="l-foot__brand">
              <a className="l-logo" href="#top"><Flame size={20} />Brazil Fire Calendar</a>
              <p>Brazil’s fire history from two NASA satellites, on one scale. Built for the NASA Space Apps Challenge 2026.</p>
            </div>
            <div><h3>Site</h3><ul>{NAV.map(([href, label]) => <li key={href}><a href={href}>{label}</a></li>)}</ul></div>
            <div><h3>Data</h3><ul><li><a href="https://firms.modaps.eosdis.nasa.gov/">NASA FIRMS</a></li><li><a href="https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api">NASA GIBS</a></li><li><a href="https://www.naturalearthdata.com/">Natural Earth</a></li></ul></div>
            <div><h3>Project</h3><ul><li><a className="l-src" href={REPO}><GitHubMark />Source code</a></li></ul></div>
          </div>
          <div className="l-credits">
            <p>
              Fire data: NASA FIRMS (Fire Information for Resource Management System), MODIS Collection 6.1 and VIIRS
              375 m active fire products. We acknowledge the use of data from NASA FIRMS, part of NASA’s Earth Science
              Data and Information System (ESDIS).
            </p>
            <p>Map imagery: NASA GIBS, for display only. State borders and country outlines: Natural Earth, public domain.</p>
            <p>Built for the NASA Space Apps Challenge 2026. Not an official NASA product.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
