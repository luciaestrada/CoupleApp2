import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const source=(await readFile(new URL('../src/services/planService.js',import.meta.url),'utf8'))
  .replace(/^import[^;]+;\s*/gm,'').replace(/^export /gm,'');
const validation=await import('data:text/javascript;base64,'+Buffer.from(await readFile(new URL('../src/utils/validation.js',import.meta.url),'utf8')).toString('base64'));

test('planes cliente: borrador por cuenta/pareja y UUID estable tras fallo de red',async()=>{
  const values=new Map(),calls=[];
  const storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  let fail=true;
  const supabase={rpc:async(name,args)=>{calls.push({name,args});return fail?{error:new Error('Sin red')}:{data:{id:args.p_id,version:1}};}};
  const api=new Function('Crypto','supabase','watchQuery','parseCalendarDate','localStorage','clearLocalReminders','syncLocalNotifications',source+'\nreturn {newPlanDraft,readPlanDraft,writePlanDraft,savePlan};')(
    {randomUUID},supabase,()=>{},validation.parseCalendarDate,storage,async()=>{},async()=>{});
  const draft={...api.newPlanDraft(),title:'Un picnic',planned_date:'25/09/2026'};
  api.writePlanDraft('a','couple',draft);
  assert.equal(api.readPlanDraft('b','couple'),null);
  assert.equal(api.readPlanDraft('a','other-couple'),null);
  await assert.rejects(api.savePlan('couple','a',draft),/Sin red/);
  fail=false;
  await api.savePlan('couple','a',api.readPlanDraft('a','couple'));
  assert.equal(calls[0].args.p_id,calls[1].args.p_id);
  assert.equal(calls[1].args.p_planned_date,'2026-09-25');
  assert.equal(calls[1].args.p_expected_user_id,'a');
  await assert.rejects(api.savePlan('couple','a',{...draft,planned_date:'31/02/2026'}),/fecha válida/);
  await assert.rejects(api.savePlan('couple','a',{...draft,link:'javascript:alert(1)'}),/enlace/);
  assert.equal(calls.length,2);
  api.writePlanDraft('a','couple',null);
  assert.equal(api.readPlanDraft('a','couple'),null);
});
