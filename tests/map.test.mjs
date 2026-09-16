import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import vm from 'node:vm';
const asset = await import(
  'data:text/javascript;base64,' +
    Buffer.from(
      await readFile(
        new URL('../src/features/map/leafletSource.js', import.meta.url),
        'utf8',
      ),
    ).toString('base64')
);
const source = (
  await readFile(
    new URL('../src/features/map/mapDocument.js', import.meta.url),
    'utf8',
  )
).replace(/^import[^;]+;/, '');
const doc = await import(
  'data:text/javascript;base64,' +
    Buffer.from(
      'const leafletJS=' +
        JSON.stringify(asset.leafletJS) +
        ';const leafletCSS=' +
        JSON.stringify(asset.leafletCSS) +
        ';\n' +
        source,
    ).toString('base64')
);
test('mapa: recursos locales, HTTPS y atribución visible', () => {
  assert.ok(
    doc.mapHTML.includes('https://tile.openstreetmap.org/{z}/{x}/{y}.png'),
  );
  assert.ok(doc.mapHTML.includes('https://www.openstreetmap.org/copyright'));
  assert.ok(!doc.mapHTML.includes('<script src='));
  assert.ok(doc.mapHTML.includes('label.textContent='));
  const scripts = [...doc.mapHTML.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 2);
  for (const [, script] of scripts)
    assert.doesNotThrow(() => new vm.Script(script));
});
test('mapa: las etiquetas no pueden ejecutar código a través del puente', () => {
  const value = {
    points: [
      {
        title: '</script><script>window.hacked=true</script>',
        lat: 40,
        lng: -3,
      },
    ],
  };
  const context = {
    window: {
      renderData: (received) =>
        assert.deepEqual(JSON.parse(JSON.stringify(received)), value),
    },
  };
  vm.runInNewContext(doc.mapCommand('renderData', value), context);
  assert.equal(context.window.hacked, undefined);
  assert.throws(() => doc.mapCommand('eval', {}));
});
