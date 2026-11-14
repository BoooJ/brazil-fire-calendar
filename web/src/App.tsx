import { useEffect, useState } from 'react';
import Landing from './pages/Landing';
import Tool from './pages/Tool';

// Hash routing: works on any static host without server rules.
const route = () => (window.location.hash.replace(/^#\/?/, '').split('?')[0] === 'app' ? 'app' : 'home');

export default function App() {
  const [page, setPage] = useState(route);
  useEffect(() => {
    const on = () => {
      setPage(route());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return page === 'app' ? <Tool /> : <Landing />;
}
