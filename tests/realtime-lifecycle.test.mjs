import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from './support/source.mjs';

const source=(await readFile(new URL('../src/services/realtimeService.ts',import.meta.url),'utf8'))
  .replace(/^import[^;]+;\s*/gm,'').replace('export function watchQuery','function watchQuery');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('observadores: comparten consulta y descartan eventos tras desconexión',async()=>{
  const changes=new Set(), channels=[],removed=[];
  const AppState={currentState:'active',addEventListener:(_,callback)=>{
    changes.add(callback);return {remove:()=>changes.delete(callback)};
  }};
  const change=state=>{AppState.currentState=state;changes.forEach(fn=>fn(state));};
  const supabase={removeChannel:async channel=>{removed.push(channel);}};
  const createRealtimeChannel=()=>{
    const channel={on:(_,__,callback)=>{channel.event=callback;return channel;},subscribe:callback=>{channel.status=callback;return channel;}};
    channels.push(channel);return channel;
  };
  const watchQuery=new Function('AppState','supabase','createRealtimeChannel',source+'\nreturn watchQuery;')(AppState,supabase,createRealtimeChannel);
  let loads=0;
  const first=[],second=[];
  const options={channelName:'messages-couple',table:'messages',load:async()=>{loads++;return ['initial'];},
    reduce:(rows,payload)=>[...rows,payload.new],onError:error=>{throw error;}};
  const stopFirst=watchQuery({...options,onData:data=>first.push(data)});
  const stopSecond=watchQuery({...options,onData:data=>second.push(data)});
  await tick();
  assert.equal(loads,1);assert.equal(channels.length,1);
  assert.deepEqual(first,second);
  stopFirst();assert.equal(removed.length,0);
  change('background');assert.equal(removed.length,1);
  channels[0].event({eventType:'INSERT',new:'late'});
  assert.equal(second.length,1);
  change('active');await tick();
  assert.equal(loads,2);assert.equal(channels.length,2);
  channels[0].event({eventType:'INSERT',new:'old connection'});
  assert.equal(second.length,2);
  channels[1].event({eventType:'INSERT',new:'current'});
  assert.deepEqual(second.at(-1),['initial','current']);
  stopSecond();assert.equal(removed.length,2);assert.equal(changes.size,0);
  channels[1].event({eventType:'INSERT',new:'after disposal'});
  assert.equal(second.length,3);
});
