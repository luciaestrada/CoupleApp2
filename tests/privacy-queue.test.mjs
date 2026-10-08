import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from './support/source.mjs';
const { createPrivacyQueue } = await import('data:text/javascript;base64,' + Buffer.from(
  await readFile(new URL('../src/features/location/privacyQueue.ts', import.meta.url), 'utf8'),
).toString('base64'));
function setup(send) {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key,value) => values.set(key,value), removeItem: key => values.delete(key) };
  let user = 'a';
  return { storage, currentUser: async () => user, send, user: value => { user = value; } };
}
test('cola de privacidad: conserva pausas sin red y las recupera después de reiniciar', async () => {
  const deps = setup(async () => { throw Error('offline'); });
  const first = createPrivacyQueue(deps);
  first.enqueue('a', true);
  await assert.rejects(first.flush('a'), /offline/);
  const sent = [];
  const restarted = createPrivacyQueue({ ...deps, send: async (...args) => sent.push(args) });
  deps.user('b');
  await restarted.flush('a');
  assert.equal(sent.length, 0);
  assert.ok(restarted.pending('a'));
  deps.user('a');
  await restarted.flush('a');
  assert.deepEqual(sent, [['a',true]]);
  assert.equal(restarted.pending('a'), null);
});
test('cola de privacidad: una pausa más amplia durante el envío no se pierde ni se envía en paralelo', async () => {
  let release;
  const sent = [];
  const deps = setup(async (user, all) => {
    sent.push([user,all]);
    if (sent.length === 1) await new Promise(resolve => { release = resolve; });
    return { geofence_paused: true };
  });
  const queue = createPrivacyQueue(deps);
  queue.enqueue('a', false);
  const operation = queue.flush('a');
  await new Promise(resolve => setImmediate(resolve));
  queue.enqueue('a', true);
  assert.equal(queue.flush('a'), operation);
  release();
  await operation;
  assert.deepEqual(sent, [['a',false],['a',true]]);
  assert.equal(queue.pending('a'), null);
});
