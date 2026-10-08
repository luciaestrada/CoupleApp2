import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash';
test('server repair deploys only application workers and keeps a backup', { skip: !existsSync(bash) }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'coupleapp-server-test-'));
  try {
    for (const path of ['scripts', 'bin', 'compose', 'mounted/main', 'mounted/unrelated',
      'supabase/functions/push', 'supabase/functions/maintenance', 'supabase/functions/_shared'])
      await mkdir(join(root, path), { recursive: true });
    await copyFile('scripts/repair-server.sh', join(root, 'scripts/repair-server.sh'));
    await copyFile('scripts/server-diagnostics.sql', join(root, 'scripts/server-diagnostics.sql'));
    for (const name of ['push', 'maintenance', '_shared'])
      await writeFile(join(root, `supabase/functions/${name}/index.ts`), `// ${name}\n`);
    await writeFile(join(root, 'supabase/functions/_shared/database.types.ts'), '// types\n');
    await writeFile(join(root, 'mounted/main/index.ts'), '// original router\n');
    await writeFile(join(root, 'mounted/unrelated/index.ts'), '// original function\n');
    const fixtures = {
      docker: `#!/usr/bin/env bash
echo "$*" >> "$TEST_ROOT/docker-calls"
if [[ "$1" == inspect ]]; then echo '[]'; fi
if [[ "$1 $2" == 'compose ps' ]]; then echo container-id; fi
if [[ "$1 $2" == 'compose exec' ]]; then cat >/dev/null; fi
`,
      python3: '#!/usr/bin/env bash\ncat >/dev/null\nprintf "%s\\n" "$TEST_ROOT/mounted"\n',
      curl: '#!/usr/bin/env bash\nprintf 401\n',
    };
    for (const [name, value] of Object.entries(fixtures))
      await writeFile(join(root, `bin/${name}`), value, { mode: 0o755 });
    const run = (apply) => spawnSync(bash, ['-c',
      'export TEST_ROOT="$PWD"; export PATH="$PWD/bin:$PATH"; bash scripts/repair-server.sh --compose-dir "$PWD/compose" ' + (apply ? '--apply' : '')],
      { cwd: root, encoding: 'utf8', timeout: 20000 });
    const diagnostic = run(false);
    assert.equal(diagnostic.status, 0, diagnostic.stderr + diagnostic.stdout);
    assert.equal(existsSync(join(root, 'mounted/push/index.ts')), false);
    assert.doesNotMatch(await readFile(join(root, 'docker-calls'), 'utf8'), /restart/);
    const deploy = run(true);
    assert.equal(deploy.status, 0, deploy.stderr + deploy.stdout);
    assert.equal(await readFile(join(root, 'mounted/maintenance/index.ts'), 'utf8'), '// maintenance\n');
    assert.equal(await readFile(join(root, 'mounted/main/index.ts'), 'utf8'), '// original router\n');
    assert.equal(await readFile(join(root, 'mounted/unrelated/index.ts'), 'utf8'), '// original function\n');
    const backups = await readdir(join(root, 'compose/coupleapp-repair-backups'));
    assert.equal(backups.length, 1);
    assert.ok(existsSync(join(root, 'compose/coupleapp-repair-backups', backups[0], 'functions-before.tar.gz')));
    const calls = await readFile(join(root, 'docker-calls'), 'utf8');
    assert.match(calls, /compose restart functions/);
    assert.doesNotMatch(calls, /pg_dump|down|setup.sql/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
