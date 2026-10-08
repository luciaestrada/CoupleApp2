import { createDatabase } from './support/database.mjs';
import { readFile } from './support/source.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

test('SQL: instalación, RLS, consentimiento, orden de muestras y entregas por dispositivo', async () => {
  const db = await createDatabase();
  try {
    const installer = (
      await readFile(new URL('../supabase/setup.sql', import.meta.url), 'utf8')
    ).replace(/^create extension[^;]+;\s*/gm, '');
    await db.exec(installer);
    const users = [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
    ];
    for (const [i, id] of users.entries())
      await db.query('insert into auth.users values($1,$2,$3)', [
        id,
        `test${i}@example.test`,
        JSON.stringify({ name: `User ${i}` }),
      ]);
    const asUser = async (id) => {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
      await db.exec('set role authenticated');
    };
    await asUser(users[0]);
    const couple = (
      await db.query('select public.create_couple(current_date-1) as value')
    ).rows[0].value;
    await asUser(users[1]);
    await db.query('select public.join_couple($1)', [
      couple.inviteCode ?? couple.invite_code,
    ]);
    const device1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const device2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    await db.query('select public.register_device($1,$2,$3,$4,$5)', [
      device1,
      'ExpoPushToken[one]',
      'ios',
      'secret-device-one-12345678901234567890',
      users[1],
    ]);
    await db.query('select public.register_device($1,$2,$3,$4,$5)', [
      device2,
      'ExpoPushToken[two]',
      'android',
      'secret-device-two-12345678901234567890',
      users[1],
    ]);
    const sample = {
      user_id: users[1],
      device_id: device1,
      sample_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      captured_at: new Date().toISOString(),
      lat: 40,
      lng: -3,
      accuracy_m: 15,
    };
    await assert.rejects(
      db.query('select public.publish_location_sample($1)', [
        JSON.stringify(sample),
      ]),
      /desactivada/,
    );
    await db.query('select public.save_settings($1,$2)', [
      JSON.stringify({ location_mode: 'balanced', history_enabled: true }),
      device1,
    ]);
    assert.equal(
      (
        await db.query(
          'select public.publish_location_sample($1) as accepted',
          [JSON.stringify(sample)],
        )
      ).rows[0].accepted,
      true,
    );
    assert.equal(
      (
        await db.query(
          'select public.publish_location_sample($1) as accepted',
          [
            JSON.stringify({
              ...sample,
              captured_at: new Date(Date.now() - 60_000).toISOString(),
            }),
          ],
        )
      ).rows[0].accepted,
      false,
    );
    await asUser(users[2]);
    assert.equal(
      (await db.query('select * from public.locations')).rows.length,
      0,
    );
    await assert.rejects(
      db.query('select * from public.devices'),
      /permission denied/,
    );
    await asUser(users[0]);
    await assert.rejects(
      db.query('select public.register_device($1,$2,$3,$4,$5)', [
        device1,
        'ExpoPushToken[stolen]',
        'ios',
        'wrong-installation-secret-123456789',
        users[0],
      ]),
      /no autorizada/,
    );
    assert.equal(
      (await db.query('select * from public.locations')).rows.length,
      1,
    );
    await db.query('select public.send_message_v2($1,$2,$3,$4)', [
      'Hola',
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      users[0],
      couple.id,
    ]);
    await db.query('select public.send_message_v2($1,$2,$3,$4)', [
      'Hola',
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      users[0],
      couple.id,
    ]);
    await db.exec('reset role');
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from public.notifications where kind='chat'",
        )
      ).rows[0].n,
      1,
    );
    const claimed = (
      await db.query('select * from public.claim_push_deliveries(100)')
    ).rows;
    assert.equal(claimed.length, 2);
    assert.equal(
      (await db.query('select * from public.claim_push_deliveries(100)')).rows
        .length,
      0,
    );
    await asUser(users[1]);
    await db.query('select public.revoke_device($1)', [device1]);
    await db.exec('reset role');
    assert.equal(
      (await db.query('select count(*)::int as n from public.devices where expo_push_token is not null')).rows[0]
        .n,
      1,
    );
    assert.equal(
      (await db.query('select sharing from public.locations')).rows[0].sharing,
      false,
    );
    await asUser(users[0]);
    const requestId = (
      await db.query('select public.request_live_location() as id')
    ).rows[0].id;
    await assert.rejects(
      db.query('select public.respond_live_location($1,true,$2)', [
        requestId,
        device2,
      ]),
      /no autorizada/,
    );
    await asUser(users[1]);
    await db.query('select public.respond_live_location($1,true,$2)', [
      requestId,
      device2,
    ]);
    assert.equal(
      (await db.query('select location_mode from public.user_settings')).rows[0]
        .location_mode,
      'live',
    );
    await db.exec('reset role');
    await db.query(
      "update public.user_settings set live_until=now()-interval '1 minute' where user_id=$1",
      [users[1]],
    );
    await asUser(users[1]);
    await assert.rejects(
      db.query('select public.publish_location_sample($1)', [
        JSON.stringify({ ...sample, device_id: device2 }),
      ]),
      /desactivada/,
    );
    await db.query('select public.save_settings($1,$2)', [
      JSON.stringify({ location_mode: 'off', chat_enabled: false }),
      device2,
    ]);
    await asUser(users[0]);
    await db.query('select public.send_message_v2($1,$2,$3,$4)', [
      'Sin push',
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      users[0],
      couple.id,
    ]);
    await asUser(users[1]);
    await db.query('select public.save_settings($1,$2)', [
      JSON.stringify({ chat_enabled: true }),
      device2,
    ]);
    await db.exec('reset role');
    assert.equal(
      (await db.query('select * from public.claim_push_deliveries(100)')).rows
        .length,
      0,
      'Reactivar avisos no debe enviar mensajes silenciados anteriormente',
    );
    await asUser(users[1]);
    const place = (
      await db.query("select public.create_geofence('Casa',40,-3,150) as place")
    ).rows[0].place;
    const eventId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const recorded = new Date(Date.now() - 10 * 60000).toISOString();
    await db.query('select public.record_geofence_entry_v2($1,$2,$3)', [
      place.id,
      eventId,
      recorded,
    ]);
    await db.query('select public.record_geofence_entry_v2($1,$2,$3)', [
      place.id,
      eventId,
      recorded,
    ]);
    assert.equal(
      (await db.query('select count(*)::int as n from public.geofence_events'))
        .rows[0].n,
      1,
    );
    await db.query('select public.leave_couple()');
    assert.equal(
      (await db.query('select * from public.locations')).rows.length,
      0,
    );
    await db.exec('reset role');
    await asUser(users[1]);
    await db.query('select public.request_account_deletion()');
    await assert.rejects(
      db.query('select public.create_couple(current_date-1)'),
      /pendiente de eliminación/,
    );
    await db.exec('reset role');
    assert.equal(
      (
        await db.query(
          'select count(*)::int as n from public.account_deletion_requests',
        )
      ).rows[0].n,
      1,
    );
    // The destructive installer must remain repeatable for disposable installations.
    await db.exec("update storage.buckets set public=true where id='avatars'");
    await db.exec(installer);
    for (const table of ['couples', 'couple_members', 'messages', 'stories', 'locations', 'notifications', 'devices', 'account_deletion_requests']) {
      assert.equal((await db.query(`select count(*)::int as n from public.${table}`)).rows[0].n, 0, `El reinicio debe vaciar ${table}`);
    }
    assert.equal((await db.query('select count(*)::int as n from auth.users')).rows[0].n, users.length);
    assert.equal((await db.query('select count(*)::int as n from public.profiles')).rows[0].n, users.length);
    assert.equal((await db.query("select public from storage.buckets where id='avatars'")).rows[0].public, false);
  } finally {
    await db.close();
  }
});

test('SQL: la migración conserva cuentas, pareja y mensajes existentes', async () => {
  const db = await createDatabase();
  try {
    const installer = (
      await readFile(new URL('../supabase/setup.sql', import.meta.url), 'utf8')
    ).replace(/^create extension[^;]+;\s*/gm, '');
    await db.exec(
      installer.split('-- BEGIN GENERATED 20260908000100')[0] + 'commit;',
    );
    const a = '11111111-1111-4111-8111-111111111111',
      b = '22222222-2222-4222-8222-222222222222';
    await db.query(
      "insert into auth.users values($1,'a@example.test','{}'),($2,'b@example.test','{}')",
      [a, b],
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [a]);
    const couple = (
      await db.query('select public.create_couple(current_date-1) as value')
    ).rows[0].value;
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [b]);
    await db.query('select public.join_couple($1)', [couple.inviteCode]);
    await db.query("select public.send_message($1,'Conservar este mensaje')", [
      couple.id,
    ]);
    await db.exec(
      await readFile(
        new URL(
          '../supabase/migrations/20260908000100_live_location_notifications.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    assert.equal(
      (await db.query('select text from public.messages')).rows[0].text,
      'Conservar este mensaje',
    );
    assert.equal(
      (await db.query('select count(*)::int as n from public.couple_members'))
        .rows[0].n,
      2,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from public.user_settings where location_mode='off'",
        )
      ).rows[0].n,
      2,
    );
    // Reproduce a partially applied update, including the reported existing column.
    await db.exec('alter table public.user_settings add column auto_live_enabled boolean not null default false');
    await db.exec(await readFile(new URL('../supabase/migrations/20260909000100_map_view_sessions.sql',import.meta.url),'utf8'));
    const upgrade = await readFile(new URL('../docs/ACTUALIZACION_UBICACION.sql',import.meta.url),'utf8');
    await db.exec(upgrade);
    await db.query('update public.user_settings set auto_live_enabled=true where user_id=$1',[a]);
    const originalFix = (await db.query("select pg_get_functiondef('public.publish_location_fix(jsonb)'::regprocedure) as definition")).rows[0].definition;
    await db.exec(upgrade);
    assert.equal((await db.query("select pg_get_functiondef('public.publish_location_fix(jsonb)'::regprocedure) as definition")).rows[0].definition, originalFix, 'Reejecutar no reemplaza el publicador privado por una función recursiva');
    assert.equal((await db.query('select auto_live_enabled from public.user_settings where user_id=$1',[a])).rows[0].auto_live_enabled,true);
    assert.equal((await db.query('select text from public.messages')).rows[0].text,'Conservar este mensaje');
    assert.equal((await db.query('select count(*)::int n from auth.users')).rows[0].n,2);
    assert.equal((await db.query('select count(*)::int n from public.couple_members')).rows[0].n,2);
    assert.equal((await db.query('select auto_live_enabled from public.user_settings where user_id=$1',[b])).rows[0].auto_live_enabled,false);
  } finally {
    await db.close();
  }
});
