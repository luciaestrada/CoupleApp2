import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source=await readFile(new URL('../src/features/affection/feedbackGate.js',import.meta.url),'utf8');
const {createFeedbackGate}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

test('háptica: solo gestos nuevos, sin historial, duplicados ni recuperación de segundo plano',()=>{
  const values=new Map();
  const storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  const now=Date.parse('2026-09-12T10:00:00Z');
  const item=(id,senderId='partner',age=0)=>({id,senderId,type:'love',createdAt:new Date(now-age).toISOString()});
  const options={storage,key:'account-couple',userId:'me',now:()=>now};
  const gate=createFeedbackGate(options);
  assert.equal(gate.accept([item('initial')]),false);
  assert.equal(gate.accept([item('new'),item('initial')]),true);
  assert.equal(gate.accept([item('new')]),false);
  assert.equal(gate.accept([item('mine','me')]),false);
  assert.equal(gate.accept([item('old','partner',16000)]),false);
  assert.equal(gate.accept([item('future','partner',-1000)]),false);
  gate.reset();
  assert.equal(gate.accept([item('while-background')]),false);
  assert.equal(gate.accept([item('live-after-resume')]),true);
  const restarted=createFeedbackGate(options);
  assert.equal(restarted.accept([]),false);
  assert.equal(restarted.accept([item('new'),item('live-after-resume')]),false);
  assert.equal(restarted.accept([item('batch-a'),item('batch-b')]),true);
});
