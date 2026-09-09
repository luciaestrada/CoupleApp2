import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
const { parse } = createRequire(import.meta.url)('@babel/parser');
test('las pantallas y el arranque contienen JavaScript y JSX válidos', async () => {
  const dir = new URL('../src/screens/', import.meta.url);
  const files = (await readdir(dir))
    .filter((name) => name.endsWith('.js'))
    .map((name) => new URL(name, dir));
  files.push(
    new URL('../App.js', import.meta.url),
    new URL('../src/navigation/AppNavigator.js', import.meta.url),
  );
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    assert.doesNotThrow(
      () => parse(source, { sourceType: 'module', plugins: ['jsx'] }),
      file.pathname,
    );
  }
});
