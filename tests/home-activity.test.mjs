import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from './support/source.mjs';

const dateSource = await readFile(new URL('../src/utils/dateUtils.ts',import.meta.url),'utf8');
const activitySource = await readFile(new URL('../src/features/home/activity.ts',import.meta.url),'utf8');
const { todayActivity,activityLabel } = await import('data:text/javascript;base64,'+Buffer.from(
  dateSource+'\n'+activitySource.replace(/^import[^;]+;/,'')
).toString('base64'));

test('Hoy: día de Madrid, medianoche, orden estable y sin duplicados',()=>{
  const now=Date.parse('2026-09-12T22:30:00Z');
  const items=[
    {id:'a',createdAt:'2026-09-12T21:59:59Z'},
    {id:'b',createdAt:'2026-09-12T22:00:00Z'},
    {id:'c',createdAt:'2026-09-12T22:20:00Z'},
    {id:'d',createdAt:'2026-09-12T22:20:00Z'},
    {id:'c',createdAt:'2026-09-12T22:20:00Z'},
    {id:'e',createdAt:'2026-09-12T23:00:00Z'},
    {id:'f',createdAt:'invalid'},
  ];
  assert.deepEqual(todayActivity(items,now).map(x=>x.id),['d','c','b']);
  assert.equal(todayActivity(items,now,2).length,2);
  assert.deepEqual(todayActivity(items,Date.parse('2026-09-13T22:00:00Z')),[]);
});

test('Hoy: el cambio de hora no duplica eventos ni expone textos en el resumen',()=>{
  const items=['2026-10-25T00:30:00Z','2026-10-25T01:30:00Z'].map((createdAt,id)=>({id:String(id),createdAt}));
  assert.equal(todayActivity(items,Date.parse('2026-10-25T03:00:00Z')).length,2);
  assert.equal(activityLabel({type:'text',text:'contenido privado'}),'Un mensaje');
  assert.equal(activityLabel({type:'event',metadata:{kind:'enter'},text:'Dirección precisa'}),'Una llegada compartida');
  for(const [kind,label] of [['love','Amor'],['kiss','Un beso'],['hug','Un abrazo'],['miss_you','Te echo de menos']]) {
    assert.equal(activityLabel({type:'love',metadata:{affection:kind}}),label);
  }
});
