import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from './support/source.mjs';
import { Buffer } from 'node:buffer';
import { createDatabase, installDatabase } from './support/database.mjs';
const load = async file => import('data:text/javascript;base64,' + Buffer.from(await readFile(new URL(file, import.meta.url),'utf8')).toString('base64'));

test('sesiones SQL: consentimiento, pausa, TTL, dispositivos y cierre fuera de orden', async () => {
  const db = await createDatabase();
  try {
    await installDatabase(db);
    const a='11111111-1111-4111-8111-111111111111', b='22222222-2222-4222-8222-222222222222', c='33333333-3333-4333-8333-333333333333';
    const da='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', dbb='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const s1='cccccccc-cccc-4ccc-8ccc-cccccccccccc',s2='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    for(const id of [a,b,c]) await db.query('insert into auth.users values($1,$2,$3)',[id,`${id}@test.invalid`,'{}']);
    const as = async id => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); await db.exec('set role authenticated'); };
    const value = async (sql,args=[]) => (await db.query(sql,args)).rows[0].v;
    await as(a);
    const couple = await value('select public.create_couple(current_date) v');
    await db.query('select public.register_device($1,null,\'android\',$2,$3)',[da,'secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',a]);
    await as(b);
    await db.query('select public.join_couple($1)',[couple.inviteCode??couple.invite_code]);
    await db.query('select public.register_device($1,null,\'ios\',$2,$3)',[dbb,'secret-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',b]);
    await as(a);
    const renew = id => value('select public.renew_map_view($1,$2) v',[da,id]);
    assert.equal((await renew(s1)).status,'consent_required');
    await as(b); await db.exec('select public.set_auto_live_enabled(true)');
    await as(a); assert.equal((await renew(s1)).status,'paused');
    await as(b); await db.query('select public.save_settings($1,$2)',[{location_mode:'balanced'},dbb]);
    await as(a);
    const result = await renew(s1);
    assert.equal(result.status,'requested');
    assert.ok(Date.parse(result.expiresAt)-Date.now()<=91000);
    await assert.rejects(db.query('select public.renew_map_view($1,$2)',[dbb,s1]));
    await assert.rejects(db.exec('update public.map_view_sessions set expires_at=now()+interval \'1 year\''));
    await renew(s2);
    await db.query('select public.end_map_view($1,$2)',[da,s1]);
    await as(b);
    assert.ok((await value('select public.get_tracking_config($1) v',[dbb])).auto_live_until);
    await db.exec('select public.set_auto_live_enabled(false)');
    assert.equal((await value('select public.get_tracking_config($1) v',[dbb])).auto_live_until,null);
    await db.exec('select public.set_auto_live_enabled(true)');
    await as(a); await renew(s2);
    await as(b); await db.query('select public.save_settings($1,$2)',[{location_mode:'off'},dbb]);
    await as(a); assert.equal((await renew(s2)).status,'paused');
    await as(c); assert.equal((await db.query('select * from public.map_view_sessions')).rows.length,0);
    await assert.rejects(renew(s1));
    await as(b); await db.query('select public.save_settings($1,$2)',[{location_mode:'balanced'},dbb]);
    await db.exec('reset role');
    await db.exec("update public.map_view_sessions set started_at=now()-interval '16 minutes',expires_at=now()-interval '1 minute'");
    await as(a); assert.equal((await renew(s2)).status,'expired');
    await as(b); assert.equal((await value('select public.get_tracking_config($1) v',[dbb])).auto_live_until,null);
  } finally { await db.close(); }
});

test('el cierre del mapa vence a una renovación que llega tarde', async () => {
  const {startMapViewing}=await load('../src/features/location/mapViewing.ts');
  let resolve,closed=0,updates=0;
  const stop=startMapViewing({renew:()=>new Promise(r=>{resolve=r;}),close:async()=>{closed++;},onState:()=>{updates++;}});
  stop(); resolve({status:'requested'});
  await new Promise(r=>setImmediate(r));
  assert.equal(updates,0); assert.equal(closed,2);
});

test('la predicción visual es acotada y no transforma una posición vieja en actual',async()=>{
  const {estimatePosition}=await load('../src/features/location/positionEstimate.ts');
  const now=Date.now(),p={lat:40,lng:-3,speed:1,heading:90,accuracy:5,updatedAt:new Date(now-10000).toISOString()};
  const projected=estimatePosition(p,now);
  assert.equal(projected.estimated,true); assert.ok(projected.lng>p.lng);
  assert.equal(projected.updatedAt,p.updatedAt); assert.equal(p.estimated,undefined);
  assert.equal(estimatePosition(p,now+21000),p);
  assert.equal(estimatePosition({...p,speed:null},now).estimated,undefined);
});

test('el muestreo cancela el GPS, incluso si el alta del observador termina tarde',async()=>{
  const {createLiveSampler}=await load('../src/features/location/liveSampler.ts');
  let resolve,removed=0;
  const sampler=createLiveSampler({watch:()=>new Promise(r=>{resolve=r;}),onFix:()=>assert.fail(),onError:()=>assert.fail()});
  sampler.remove(); resolve({remove:()=>removed++});
  await new Promise(r=>setImmediate(r));
  assert.equal(removed,1);
});
