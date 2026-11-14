// The 26 states of Brazil and the Federal District, as plain boxes we define ourselves
// (rounded to 0.1°, mainland only). They are NOT official borders: a box also covers a bit of the
// neighbouring states, and the page says so. No outside border dataset is used (hard rule 1).
import type { Area } from './geo';
import { rectPolygon } from './geo';

/** [code, name, west, south, east, north] */
const BOXES: [string, string, number, number, number, number][] = [
  ['AC', 'Acre', -74.0, -11.2, -66.6, -7.1],
  ['AL', 'Alagoas', -38.3, -10.5, -35.1, -8.8],
  ['AP', 'Amapá', -54.9, -1.3, -49.8, 4.5],
  ['AM', 'Amazonas', -73.8, -9.9, -56.1, 2.3],
  ['BA', 'Bahia', -46.7, -18.4, -37.3, -8.5],
  ['CE', 'Ceará', -41.5, -7.9, -37.2, -2.7],
  ['DF', 'Distrito Federal', -48.3, -16.1, -47.3, -15.5],
  ['ES', 'Espírito Santo', -41.9, -21.3, -39.6, -17.9],
  ['GO', 'Goiás', -53.3, -19.5, -45.9, -12.4],
  ['MA', 'Maranhão', -48.8, -10.3, -41.8, -1.0],
  ['MT', 'Mato Grosso', -61.7, -18.1, -50.2, -7.3],
  ['MS', 'Mato Grosso do Sul', -58.2, -24.1, -50.9, -17.1],
  ['MG', 'Minas Gerais', -51.1, -23.0, -39.8, -14.2],
  ['PA', 'Pará', -58.9, -9.9, -46.0, 2.6],
  ['PB', 'Paraíba', -38.8, -8.3, -34.7, -6.0],
  ['PR', 'Paraná', -54.7, -26.8, -48.0, -22.5],
  ['PE', 'Pernambuco', -41.4, -9.5, -34.8, -7.2],
  ['PI', 'Piauí', -46.0, -11.0, -40.3, -2.7],
  ['RJ', 'Rio de Janeiro', -44.9, -23.4, -40.9, -20.7],
  ['RN', 'Rio Grande do Norte', -38.6, -7.0, -34.9, -4.8],
  ['RS', 'Rio Grande do Sul', -57.7, -33.8, -49.6, -27.0],
  ['RO', 'Rondônia', -66.9, -13.7, -59.7, -7.9],
  ['RR', 'Roraima', -64.9, -1.6, -58.8, 5.3],
  ['SC', 'Santa Catarina', -53.9, -29.4, -48.3, -25.9],
  ['SP', 'São Paulo', -53.2, -25.4, -44.1, -19.7],
  ['SE', 'Sergipe', -38.3, -11.6, -36.3, -9.5],
  ['TO', 'Tocantins', -50.8, -13.5, -45.6, -5.1],
];

export const STATES = BOXES.map(([code, name]) => ({ code, name }));

export function stateArea(code: string): Area | null {
  const b = BOXES.find((x) => x[0] === code);
  if (!b) return null;
  const [, name, w, s, e, n] = b;
  return {
    label: `${name} (box)`,
    polygon: rectPolygon(w, s, e, n),
    center: [(w + e) / 2, (s + n) / 2],
    radiusDeg: Math.max(e - w, n - s) / 2,
    presetId: `state-${code.toLowerCase()}`,
  };
}
