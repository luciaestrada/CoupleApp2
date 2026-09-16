import { leafletJS, leafletCSS } from './leafletSource';

// Leaflet is bundled locally; only visible map tiles leave the device.
export const mapHTML = `<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https://tile.openstreetmap.org data:;"><style>${leafletCSS}
html,body,#map{height:100%;margin:0;background:#f3efe9}.leaflet-container{font:14px system-ui}.leaflet-control-attribution{font-size:10px!important}.leaflet-control-zoom a{width:36px!important;height:36px!important;line-height:36px!important}#notice{position:absolute;z-index:1000;top:10px;left:58px;right:12px;padding:10px;border-radius:10px;background:#fff6df;color:#62450a;font:13px system-ui;display:none}
.partner-label{white-space:normal;width:200px;border:1px solid #4263eb;border-radius:12px;padding:10px;color:#30232a}.partner-label strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;margin-bottom:3px}.partner-label .detail{font-size:12px;line-height:16px;color:#715f68;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
</style></head><body><div id="map" aria-label="Mapa interactivo"></div><div id="notice" role="status">No se pudo cargar el mapa. Comprueba tu conexión.</div><script>${leafletJS}</script><script>
const send = value => window.ReactNativeWebView.postMessage(JSON.stringify(value));
const map = L.map('map',{zoomControl:true,attributionControl:true}).setView([40.4168,-3.7038],5);
map.zoomControl.setPosition('bottomleft');
const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,keepBuffer:0,updateWhenIdle:true,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
tiles.on('tileerror',()=>{document.getElementById('notice').style.display='block';send({type:'tileerror'});});
tiles.on('tileload',()=>{document.getElementById('notice').style.display='none';});
const points=L.layerGroup().addTo(map);
const valid = p => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat)<=90 && Math.abs(p.lng)<=180;
window.renderData = data => {
 points.clearLayers();
 (data.points||[]).filter(valid).forEach(p=>{
  const color=/^#[0-9a-f]{6}$/i.test(p.color||'')?p.color:'#A62450';
  const marker=L.circleMarker([p.lat,p.lng],{radius:p.selected?10:8,color:'#fff',weight:3,fillColor:color,fillOpacity:1}).addTo(points);
  const label=document.createElement('div');label.textContent=p.title||'';
  if(Array.isArray(p.details)&&p.details.length){
    label.textContent='';
    if(p.expanded){
    const title=document.createElement('strong');title.textContent=p.title||'';label.appendChild(title);
    p.details.forEach(text=>{const line=document.createElement('div');line.className='detail';line.textContent=text;label.appendChild(line);});
    }else{label.textContent=p.summary||p.title||'';label.style.whiteSpace='nowrap';label.style.overflow='hidden';label.style.textOverflow='ellipsis';}
    const toggle=()=>send({type:'marker',id:p.id});
    marker.on('click',toggle);
    label.setAttribute('role','button');label.setAttribute('tabindex','0');label.setAttribute('aria-expanded',String(!!p.expanded));
    label.setAttribute('aria-label',(p.summary||p.title||'')+(p.expanded?' · Ocultar detalles':' · Mostrar detalles'));
    label.addEventListener('click',event=>{L.DomEvent.stopPropagation(event);toggle();});
    label.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();toggle();}});
    marker.bindTooltip(label,{permanent:true,interactive:true,direction:'top',offset:[0,-12],opacity:1,className:'partner-label'});
  } else marker.bindPopup(label);
  if(Number.isFinite(p.radius)&&p.radius>0)L.circle([p.lat,p.lng],{radius:Math.min(p.radius,10000),color,weight:1,fillOpacity:0.12}).addTo(points);
 });
 const history=(data.history||[]).filter(valid);
 if(history.some(p=>p.approximate)){
   history.forEach(p=>{const radius=Number.isFinite(p.accuracy_m)?Math.max(1,p.accuracy_m):2000;
     const zone=L.circle([p.lat,p.lng],{radius,color:'#4263EB',weight:1,fillOpacity:0.08}).addTo(points);
     const label=document.createElement('div');label.textContent='Zona aproximada · '+(p.recorded_at||'');zone.bindPopup(label);
   });
 }else if(history.length>1)L.polyline(history.map(p=>[p.lat,p.lng]),{color:'#4263EB',weight:3}).addTo(points);
};
window.moveCamera = payload => {
 if(payload.points){const pts=payload.points.filter(p=>Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)).map(p=>[p.latitude,p.longitude]);const p=payload.edgePadding||{};if(pts.length)map.fitBounds(pts,{paddingTopLeft:[p.left??40,p.top??40],paddingBottomRight:[p.right??40,p.bottom??40],maxZoom:16,animate:false});}
 else if(Number.isFinite(payload.latitude)&&Number.isFinite(payload.longitude))map.setView([payload.latitude,payload.longitude],15,{animate:false});
};
map.on('dragstart',()=>send({type:'pan'}));
map.on('click',e=>send({type:'point',latitude:e.latlng.lat,longitude:e.latlng.lng}));
window.addEventListener('resize',()=>map.invalidateSize());
send({type:'ready'});
</script></body></html>`;
export function mapCommand(name, payload) {
  if (!['renderData', 'moveCamera'].includes(name))
    throw new Error('Invalid map command');
  return `window.${name}(${JSON.stringify(payload).replace(/</g, '\\u003c')});true;`;
}
