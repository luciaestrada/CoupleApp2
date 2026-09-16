import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase, installDatabase } from './support/database.mjs';
test('multimedia: reserva privada, validación real del archivo y borrado pendiente', async () => {
  const db = await createDatabase();
  try {
    await installDatabase(db);
    const a=randomUUID(),b=randomUUID();
    const as=async id=>{ await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); await db.exec('set role authenticated'); };
    const value=async(sql,args=[]) => (await db.query(sql,args)).rows[0].v;
    for(const id of [a,b]) await db.query('insert into auth.users values($1,$2,$3)',[id,id+'@test.invalid','{}']);
    await as(a); const couple=await value('select public.create_couple(current_date) v');
    await as(b); await db.query('select public.join_couple($1)',[couple.inviteCode??couple.invite_code]);
    await as(a);
    const id=randomUUID();
    const reserve=()=>value("select to_jsonb(public.reserve_media_upload($1,'memory','image','image/jpeg',1000)) v",[id]);
    const asset=await reserve();
    assert.equal((await reserve()).id,id);
    await assert.rejects(db.query("select public.reserve_media_upload($1,'memory','image','image/jpeg',10485761)",[randomUUID()]),/grande/);
    await assert.rejects(db.query('select public.complete_media_upload($1)',[id]),/no coincide/);
    await as(b);
    assert.equal(await value('select count(*)::int v from public.media_assets'),0);
    await assert.rejects(db.query('select public.complete_media_upload($1)',[id]),/no disponible/);
    await db.exec('reset role');
    await db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',[asset.bucket_id,asset.object_path,{size:2000,mimetype:'image/jpeg'}]);
    await as(a); await assert.rejects(db.query('select public.complete_media_upload($1)',[id]),/no coincide/);
    await db.exec('reset role'); await db.query('update storage.objects set metadata=$1 where name=$2',[{size:1000,mimetype:'image/jpeg'},asset.object_path]);
    await as(a); await db.query('select public.complete_media_upload($1)',[id]);
    await as(b); assert.equal(await value('select count(*)::int v from public.media_assets'),0,'Terminar carga no publica un borrador');
    await as(a); await db.query('select public.cancel_media_upload($1)',[id]);
    await assert.rejects(reserve(),/cancelada/);
    await db.exec('reset role');
    assert.equal(await value('select count(*)::int v from public.media_deletions'),1);
  } finally { await db.close(); }
});
