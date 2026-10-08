import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from './support/source.mjs';
const { formatSharedDistance } = await import('data:text/javascript;base64,' + Buffer.from(
  await readFile(new URL('../src/features/location/distanceLabel.ts', import.meta.url), 'utf8'),
).toString('base64'));
test('distancia: expresa incertidumbre y no simula metros exactos para zonas', () => {
  assert.equal(formatSharedDistance(3.2, {accuracy:2000}, {accuracy:2000}), 'Entre 0 y 8 km aprox.');
  assert.equal(formatSharedDistance(10, {accuracy:1000}, {accuracy:1000}), 'Entre 8 y 12 km aprox.');
  assert.equal(formatSharedDistance(0, {accuracy:5}, {accuracy:5}), 'Menos de 10 m aprox.');
  assert.match(formatSharedDistance(0.123, {}, {}), /aprox/);
  assert.equal(formatSharedDistance(NaN, {}, {}), null);
});
