import test from 'node:test';
import assert from 'node:assert/strict';
import { createSignedUrlCache } from '../src/features/stories/signedUrls.ts';

test('historias: limpiar la sesión descarta las firmas pendientes y su caché', async () => {
  const resolutions = [];
  const cache = createSignedUrlCache(() => new Promise(resolve => resolutions.push(resolve)));
  const old = cache.get('photo');
  cache.clear();
  const fresh = cache.get('photo');
  assert.equal(resolutions.length, 2, 'Una cuenta nueva no comparte una firma en vuelo');
  resolutions[0]('old-session-url');
  await old;
  const shared = cache.get('photo');
  assert.equal(resolutions.length, 2, 'La promesa antigua no retira la nueva');
  resolutions[1]('new-session-url');
  assert.equal(await fresh, 'new-session-url');
  assert.equal(await shared, 'new-session-url');
  assert.equal(await cache.get('photo'), 'new-session-url');
});
