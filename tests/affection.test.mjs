import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase, installDatabase } from './support/database.mjs';
test('afecto: cuatro gestos, una regla de racha y reintentos sin duplicados', async()=>{
  const db=await createDatabase();
  try {
    await installDatabase(db);
    const a=randomUUID(),b=randomUUID();
    const as=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
    const value=async(sql,args=[]) => (await db.query(sql,args)).rows[0].v;
    for(const id of [a,b]) await db.query('insert into auth.users values($1,$2,$3)',[id,id+'@test.invalid','{}']);
    await as(a);const couple=await value('select public.create_couple(current_date) v');
    await as(b);await db.query('select public.join_couple($1)',[couple.inviteCode??couple.invite_code]);
    await as(a);const c=await value('select public.current_couple_id() v');
    for(const kind of ['love','kiss','hug','miss_you']) {
      const id=randomUUID();
      await db.query('select public.send_affection($1,$2,$3)',[c,id,kind]);
      await db.query('select public.send_affection($1,$2,$3)',[c,id,kind]);
      await assert.rejects(db.query('select public.send_affection($1,$2,$3)',[c,id,kind==='hug'?'kiss':'hug']),/otra acción/);
    }
    assert.equal(await value("select count(*)::int v from public.messages where type='love'"),4);
    assert.equal(await value('select love_streak_count v from public.couple_members where user_id=auth.uid()'),1);
    await as(b);
    assert.equal(await value("select count(*)::int v from public.notifications where kind='love'"),4);
    assert.equal(await value("select count(*)::int v from public.notifications where body like '%abrazo%'"),1);
    assert.equal(await value("select count(*)::int v from public.notifications where body like '%beso%'"),1);
  } finally {await db.close();}
});
