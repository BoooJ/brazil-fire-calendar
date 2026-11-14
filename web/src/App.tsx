import { Suspense, lazy, useEffect, useState } from 'react';

// Hash routing: works on any static host without server rules.
//   #/     the landing page
//   #/app  the tool
// Each page is its own chunk with its own stylesheet. The two never share a document: moving from one to
// the other reloads the page, so the landing page's design kit (public/assets/) and the tool's styles
// cannot leak into each other.
const Landing = lazy(() => import('./pages/Landing'));
const Tool = lazy(() => import('./pages/Tool'));

const route = () => (window.location.hash.replace(/^#\/?/, '').split('?')[0] === 'app' ? 'app' : 'home');

export default function App() {
  const [page] = useState(route);
  useEffect(() => {
    const on = () => {
      if (route() === page) return; // an in-page anchor (#method) on the landing page: nothing to do
      window.scrollTo(0, 0);
      window.location.reload();
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, [page]);
  return <Suspense fallback={null}>{page === 'app' ? <Tool /> : <Landing />}</Suspense>;
}
