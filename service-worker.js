const CACHE_NAME='anking-v10-core';
const CORE_ASSETS=['./','./index.html','./styles.css','./app.js','./cards_part1.json','./cards_part2.json','./cards_part3.json','./cards_part4.json','./manifest.json'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(CORE_ASSETS))));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(resp=>{const copy=resp.clone();caches.open(CACHE_NAME).then(c=>c.put(e.request,copy));return resp;}).catch(()=>cached)))});
