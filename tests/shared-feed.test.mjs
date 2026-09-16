import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createDatabase, installDatabase } from './support/database.mjs';

test('registro compartido: amor repetido, avisos por transición, multimedia, batería y recorridos', async()=>{
  const db=await createDatabase();
  try {
    await installDatabase(db);
    // The update must also work on the current installer and leave RPCs usable.
    const upgrade=await readFile(new URL('../docs/ACTUALIZACION_UBICACION.sql',import.meta.url),'utf8');
    await db.exec(upgrade);
    await db.exec(upgrade);
    const a=randomUUID(),b=randomUUID(),outsider=randomUUID(),device=randomUUID();
    const as=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
    const value=async(sql,args=[]) => (await db.query(sql,args)).rows[0].v;
    for(const id of [a,b,outsider])await db.query('insert into auth.users values($1,$2,$3)',[id,id+'@test.invalid','{}']);
    await as(a);const couple=await value('select public.create_couple(current_date) v');
    await as(b);await db.query('select public.join_couple($1)',[couple.inviteCode??couple.invite_code]);
    await as(a); const c=await value('select public.current_couple_id() v');
    const client=randomUUID();
    await db.query('select public.send_love_v2($1,$2)',[c,client]);
    await db.query('select public.send_love_v2($1,$2)',[c,client]);
    await db.query('select public.send_love_v2($1,$2)',[c,randomUUID()]);
    assert.equal(await value("select count(*)::int v from public.messages where type='love'"),2);
    assert.equal(await value('select love_streak_count v from public.couple_members where user_id=$1',[a]),1);
    await as(b);
    assert.equal(await value("select count(*)::int v from public.notifications where kind='love'"),2);
    await db.query('select public.save_behavior_options($1,$2)',[{}, {exit:false,cycling:false}]);
    await assert.rejects(db.query('select public.save_behavior_options($1,$2)',[{normal_interval:0},{}]));
    await assert.rejects(db.query('select public.save_behavior_options($1,$2)',[{share_activity:'true'},{}]));
    await as(a);
    const place=await value("select public.create_geofence('Casa',40,-3,150) v");
    const now=Date.now();
    const event=randomUUID();
    await db.query('select public.record_geofence_transition($1,$2,$3,$4)',[place.id,event,new Date(now-10000).toISOString(),'enter']);
    await db.query('select public.record_geofence_transition($1,$2,$3,$4)',[place.id,event,new Date(now-10000).toISOString(),'enter']);
    await db.query('select public.record_geofence_transition($1,$2,$3,$4)',[place.id,randomUUID(),new Date(now-5000).toISOString(),'exit']);
    assert.equal(await value('select count(*)::int v from public.geofence_events'),2);
    await as(b);
    assert.equal(await value("select push_enabled_at_creation v from public.notifications where kind='exit'"),false);
    await as(a);
    for(const [index,media,ext] of [[0,'image','jpg'],[1,'video','mp4']]){
      const path=`${c}/${a}/${now+index}.${ext}`;
      await db.exec('reset role');await db.query("insert into storage.objects(bucket_id,name) values('stories',$1)",[path]);await as(a);
      const story=await value('select public.create_story_v2($1,$2,$3) v',[path,media,'Un día juntos']);
      assert.equal(await value('select media_type v from public.stories where id=$1',[story]),media);
    }
    assert.equal(await value("select count(*)::int v from public.messages where metadata->>'kind'='story'"),2);
    await db.query('select public.register_device($1,null,$2,$3,$4)',[device,'android','secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',a]);
    await db.query('select public.save_settings($1,$2)',[{location_mode:'balanced'},device]);
    const send=async(lat,seconds,speed,activity)=>{
      await db.exec('reset role');
      await db.exec("update public.locations set updated_at=now()-interval '10 seconds'");
      await as(a);
      assert.equal(await value('select public.publish_location_sample($1) v',[{
        user_id:a,device_id:device,sample_id:randomUUID(),captured_at:new Date(now+seconds*1000).toISOString(),
        lat,lng:-3,accuracy_m:5,speed_mps:speed,heading:0,battery_level:88,charging:true,activity,activity_confidence:'high',
      }]),true);
    };
    await send(40,-600,2,'walking');
    await send(40.001,-560,2,'walking');
    assert.equal((await value('select public.get_tracking_config($1) v',[device])).trip_active,true);
    await send(40.001,-520,0,'stationary');
    await send(40.001,-300,0,'stationary');
    assert.equal(await value('select battery_level v from public.locations'),88);
    assert.equal(await value('select count(*)::int v from public.trips where ended_at is not null'),1);
    assert.equal(await value("select count(*)::int v from public.messages where metadata->>'kind'='trip'"),1);
    assert.ok((await value('select points v from public.trips')).length>=2);
    await db.query('select public.save_behavior_options($1,$2)',[{share_battery:false,share_activity:false},{}]);
    assert.equal(await value('select battery_level v from public.locations'),null);
    assert.equal(await value('select activity v from public.locations'),null);
    await as(outsider);
    assert.equal(await value('select count(*)::int v from public.trips'),0);
    await assert.rejects(db.query('select public.finish_trip($1,$2,now())',[a,'arrival']));
    await assert.rejects(db.query('select public.publish_location_fix($1)',[{}]));
  } finally {await db.close();}
});
