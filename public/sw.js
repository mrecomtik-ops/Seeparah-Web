/* Minimal privacy-preserving PWA offline shell.
 * Never cache reader API payloads, auth, user pages or translation content:
 * books may be unpublished or have rights withdrawn.
 */
const CACHE='seeparah-pwa-shell-v1';
const ASSETS=['/offline.html','/favicon.png','/icons/seeparah.svg'];
self.addEventListener('install',(event)=>{
  event.waitUntil(caches.open(CACHE).then((cache)=>cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate',(event)=>{
  event.waitUntil(Promise.all([
    caches.keys().then((keys)=>Promise.all(
      keys.filter((name)=>name!==CACHE).map((name)=>caches.delete(name)))),
    self.clients.claim(),
  ]));
});
self.addEventListener('fetch',(event)=>{
  const request=event.request;
  if(request.method!=='GET'||request.mode!=='navigate')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin||url.pathname.startsWith('/api/') ||
     url.pathname.startsWith('/admin')||url.pathname.startsWith('/auth'))return;
  event.respondWith(fetch(request).catch(async()=>{
    const cache=await caches.open(CACHE);
    return await cache.match('/offline.html') ||
      new Response('Offline',{status:503,headers:{'content-type':'text/plain'}});
  }));
});
