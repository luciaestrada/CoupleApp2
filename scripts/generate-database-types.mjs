import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createDatabase, installDatabase } from '../tests/support/database.mjs';
const db = await createDatabase();
try {
  await installDatabase(db);
  const types = new Map(
    (await db.query('select oid,typname from pg_type')).rows.map((row) => [
      row.oid,
      row.typname,
    ]),
  );
  const columns = (
    await db.query(
      "select table_name,column_name,udt_name,is_nullable,column_default from information_schema.columns where table_schema='public' order by table_name,ordinal_position",
    )
  ).rows;
  const tables = [...new Set(columns.map((row) => row.table_name))];
  const type = (name) =>
    name?.startsWith('_')
      ? `(${type(name.slice(1))})[]`
      : ['int2', 'int4', 'int8', 'float4', 'float8', 'numeric'].includes(name)
        ? 'number'
        : name === 'bool'
          ? 'boolean'
          : ['json', 'jsonb'].includes(name)
            ? 'Json'
            : name === 'void'
              ? 'undefined'
              : tables.includes(name)
                ? `Database['public']['Tables']['${name}']['Row']`
                : 'string';
  let output =
    '// Generated from the executable installer. Run npm run types:generate.\nexport type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];\nexport type Database = { public: { Tables: {\n';
  for (const table of tables) {
    const fields = columns.filter((row) => row.table_name === table);
    output += `  ${table}: {\n`;
    for (const shape of ['Row', 'Insert', 'Update']) {
      output += `    ${shape}: {\n`;
      for (const row of fields)
        output += `      ${row.column_name}${shape === 'Update' || (shape === 'Insert' && (row.column_default || row.is_nullable === 'YES')) ? '?' : ''}: ${type(row.udt_name)}${row.is_nullable === 'YES' ? ' | null' : ''};\n`;
      output += '    };\n';
    }
    output += '    Relationships: [];\n  };\n';
  }
  output += '}; Views: Record<never, never>; Functions: {\n';
  const functions = (
    await db.query(
      "select p.proname,p.proargnames,coalesce(p.proallargtypes,p.proargtypes::oid[]) as types,p.proargmodes,p.prorettype,p.proretset,p.pronargdefaults from pg_proc p join pg_namespace n on p.pronamespace=n.oid where n.nspname='public' and p.prorettype<>'trigger'::regtype order by p.proname",
    )
  ).rows;
  for (const fn of functions) {
    const args = (fn.types ?? []).map((oid, index) => ({
      type: type(types.get(oid)),
      name: fn.proargnames?.[index] ?? `arg${index}`,
      mode: fn.proargmodes?.[index] ?? 'i',
    }));
    const inputs = args.filter((arg) => arg.mode === 'i');
    // PostgreSQL does not encode argument nullability. These RPCs explicitly
    // accept null to clear an avatar or save a plan without a scheduled date.
    const nullable = {
      update_profile: ['p_avatar_path'],
      save_couple_plan: ['p_planned_date'],
    };
    for (const arg of inputs) {
      if (nullable[fn.proname]?.includes(arg.name)) arg.type += ' | null';
    }
    const outputs = args.filter((arg) => ['o', 't'].includes(arg.mode));
    const returns = outputs.length
      ? `{ ${outputs.map((arg) => `${arg.name}: ${arg.type}`).join('; ')} }`
      : type(types.get(fn.prorettype));
    output += `  ${fn.proname}: { Args: { ${inputs.map((arg, index) => `${arg.name}${index >= inputs.length - fn.pronargdefaults ? '?' : ''}: ${arg.type}`).join('; ')} }; Returns: ${returns}${fn.proretset ? '[]' : ''} };\n`;
  }
  output +=
    '}; Enums: Record<never, never>; CompositeTypes: Record<never, never> } };\n';
  const file = 'supabase/functions/_shared/database.types.ts';
  if (process.argv.includes('--check')) {
    if ((await readFile(file, 'utf8')) !== output)
      throw new Error('Tipos SQL desactualizados: npm run types:generate');
  } else {
    await mkdir('supabase/functions/_shared', { recursive: true });
    await writeFile(file, output);
  }
} finally {
  await db.close();
}
