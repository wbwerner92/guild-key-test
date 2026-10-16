const RELEASE = {"app":"guild-encrypted-prototype","label":"Trial 3","version":"eb6ba9a3f2c8f090","assets":[{"path":"index.html","sha256":"67aed22a0954b3693060b5a7da00fbecdfdcacfc4b631638459e2e56b7f33b44"},{"path":"loader.css","sha256":"bd49a0a0a18e85114481f6a5cf44f537b378e2e175de36fd89dc42f5dbeb58cd"},{"path":"loader.js","sha256":"5fc171c88ff774caa6a57f8dc71892ba2fd339002aa21c386b9b5a1c0a80622a"},{"path":"crypto.js","sha256":"96124f26f898b55133a9925156a9bdef4a70dae4693de446cc3665d6c2b325bc"},{"path":"manifest.webmanifest","sha256":"e00dafca513114a21e77aeea4a599dd7a749931bf486dbe0dbee1d9ab473cb6c"},{"path":"package.enc.json","sha256":"6db7aba9aadbc8cdeebfa3824388183c31d546f94213c2ef81d520e0ab68e5ce"},{"path":"public-key.json","sha256":"c94fbd1d01b82b08ebc183e67c1c3ee4fc9897aec7c741dca369c40a4ffb30e7"},{"path":"icon-192.png","sha256":"709469ce12c0ccba2c1d1272fef396ce5c1d004a3faf2967fd89cd689efb8e9a"},{"path":"icon-512.png","sha256":"77227018db7611dfbc0e14fd443d87ee1b8e998e94085c3fcf2a922782a64f0e"},{"path":"touch.png","sha256":"f0e8a6b1ed458b1dafd907f4cd9f6af3a511e8406ab4ae626bbe18a1ec479194"}]};
'use strict';
const scope=new URL(self.registration.scope),prefix='guild-sealed-prototype:'+encodeURIComponent(scope.href)+':',cacheName=prefix+RELEASE.version;
const assets=new Map(RELEASE.assets.map(asset=>[new URL(asset.path,scope).href,asset]));
const index=new URL('index.html',scope).href;
const hex=buffer=>[...new Uint8Array(buffer)].map(value=>value.toString(16).padStart(2,'0')).join('');
async function ready(){const store=await caches.open(cacheName);return (await Promise.all([...assets.keys()].map(url=>store.match(url)))).every(Boolean);}
self.addEventListener('install',event=>event.waitUntil((async()=>{
  try{const store=await caches.open(cacheName);for(const [url,asset] of assets){const response=await fetch(new Request(url,{cache:'reload',credentials:'omit',redirect:'error'}));if(!response.ok||response.redirected||hex(await crypto.subtle.digest('SHA-256',await response.clone().arrayBuffer()))!==asset.sha256)throw new Error('Incomplete encrypted release');await store.put(url,response);}}
  catch(error){await caches.delete(cacheName);throw error;}
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{if(!await ready())throw new Error('Incomplete release');for(const key of await caches.keys())if(key.startsWith(prefix)&&key!==cacheName)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);if(url.origin!==scope.origin)return;
  const clean=new URL(url.pathname,scope.origin).href,key=event.request.mode==='navigate'&&(clean===scope.href||clean===index)?index:clean;
  if(!assets.has(key))return;
  event.respondWith((async()=>await (await caches.open(cacheName)).match(key)||new Response('Encrypted prototype offline files are incomplete. Reconnect and reopen.',{status:503}))());
});
self.addEventListener('message',event=>event.waitUntil((async()=>{
  const reply=value=>event.ports?.[0]?.postMessage(value);
  const client=event.source?.id?await self.clients.get(event.source.id):null;if(!client||!client.url.startsWith(scope.href))return;
  if(event.data?.type==='SEALED_STATUS')return reply({ready:await ready(),version:RELEASE.version,label:RELEASE.label});
  if(event.data?.type!=='SEALED_ACTIVATE')return;
  if(!await ready())return reply({ok:false,message:'Update is incomplete. Reconnect and try again.'});
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  if(windows.some(other=>other.id!==client.id&&other.url.startsWith(scope.href)))return reply({ok:false,message:'Close other prototype windows, then try the update again.'});
  reply({ok:true});await self.skipWaiting();
})()));
