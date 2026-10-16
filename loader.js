'use strict';
(() => {
  const $=selector=>document.querySelector(selector),input=$('#private-key'),room=$('#test-room');
  let epoch=0,unlocked=false,busy=false,applying=false,registration,prompt,reloadTimer;
  function status(text,error=false){$('#unlock-status').textContent=text;$('#unlock-status').classList.toggle('error',error);}
  function controls(){input.disabled=busy||applying;$('#lock').hidden=!unlocked&&!busy;$('#lock').disabled=applying;$('#check-update').disabled=!registration||applying;$('#apply-update').hidden=!registration?.waiting;$('#apply-update').disabled=busy||applying;$('#update-notice').hidden=!registration?.waiting;$('#install').hidden=!prompt;}
  function lock(text='Locked. Select your private key file to open the test room again.'){
    epoch++;unlocked=false;busy=false;room.replaceChildren();room.hidden=true;
    input.value='';$('#state').textContent='Locked';status(text);controls();
  }
  async function cspHash(text){const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));return 'sha256-'+btoa(String.fromCharCode(...digest));}
  async function unlock(file){
    if(!file||applying)return;
    lock('Reading your key locally…');const job=epoch;busy=true;controls();
    try{
      if(file.size>GuildSealedCrypto.maxKey)throw new Error('Choose a prototype private key JSON file smaller than 16 KB.');
      let key;try{key=JSON.parse(await file.text());}catch{throw new Error('This is not a readable private key JSON file.');}
      if(job!==epoch)return;
      const response=await fetch('package.enc.json',{cache:'no-store',credentials:'omit',redirect:'error'});
      if(!response.ok)throw new Error('The encrypted package is unavailable. Connect once and wait for Offline ready.');
      const text=await response.text();if(text.length>750000)throw new Error('The encrypted package exceeds its size limit.');
      const app=await GuildSealedCrypto.open(JSON.parse(text),key);key=null;
      if(job!==epoch)return;
      if(/<\/script/i.test(app.js)||/<\/style/i.test(app.css))throw new Error('Unsupported embedded app content.');
      const scriptHash=await cspHash(app.js),styleHash=await cspHash(app.css);if(job!==epoch)return;
      const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src '+"'none'; script-src '"+scriptHash+"'; style-src '"+styleHash+"'; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'"+'"><style>'+app.css+'</style></head><body>'+app.html+'<script>'+app.js+'</script></body></html>';
      const frame=document.createElement('iframe');frame.setAttribute('sandbox','allow-scripts');frame.title='Unlocked encrypted test room';frame.srcdoc=html;room.replaceChildren(frame);room.hidden=false;unlocked=true;
      $('#state').textContent='Opening…';status('Private key accepted. Starting the encrypted test room…');
      setTimeout(()=>{if(job===epoch&&unlocked&&!frame.dataset.ready){lock();status('The key worked, but this browser could not start the test room. This needs a compatibility check.',true);}},6000);
    }catch(error){if(job===epoch)status(error.message||'Could not unlock this package.',true);}
    finally{if(job===epoch){busy=false;input.value='';controls();}}
  }
  input.addEventListener('change',()=>unlock(input.files?.[0]));
  window.addEventListener('message',event=>{const frame=room.querySelector('iframe');if(frame&&event.source===frame.contentWindow&&event.data?.type==='sealed-room-ready'){frame.dataset.ready='yes';$('#state').textContent='Unlocked';status('Private key accepted. The test room is running in memory; locking removes it.');}});
  $('#lock').addEventListener('click',()=>lock());
  window.addEventListener('pagehide',()=>lock());
  document.addEventListener('visibilitychange',()=>{if(document.hidden)lock('Locked when the app left the screen. Select your key to reopen.');});
  function message(worker,type){return new Promise((resolve,reject)=>{const channel=new MessageChannel();const timer=setTimeout(()=>{channel.port1.close();reject(new Error('The offline worker did not respond. Reopen the prototype and try again.'));},6000);channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data);};worker.postMessage({type},[channel.port2]);});}
  async function readiness(){controls();if(!registration?.active)return;try{const result=await message(registration.active,'SEALED_STATUS');$('#offline-status').textContent=result.ready?'Offline ready · encrypted release '+result.label+'. Reopening still requires your private key file.':'Offline files are incomplete. Reconnect before relying on offline use.';}catch(error){$('#offline-status').textContent=error.message;}}
  $('#check-update').addEventListener('click',async()=>{try{await registration.update();await readiness();}catch{$('#offline-status').textContent='Could not check for updates. The existing cached release is preserved.';}});
  $('#apply-update').addEventListener('click',async()=>{
    if(!registration?.waiting||busy||applying)return;
    lock('Locked for update. Your key will be required again.');applying=true;controls();
    try{const result=await message(registration.waiting,'SEALED_ACTIVATE');if(!result.ok)throw new Error(result.message);reloadTimer=setTimeout(()=>{applying=false;controls();status('Update has not reloaded yet. Close all prototype windows and reopen.',true);},12000);}
    catch(error){applying=false;status(error.message,true);controls();}
  });
  navigator.serviceWorker?.addEventListener('controllerchange',()=>{if(applying){clearTimeout(reloadTimer);location.reload();}else{lock('Offline files are ready. Select your key to unlock.');readiness();}});
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();prompt=event;controls();});
  $('#install').addEventListener('click',async()=>{if(!prompt)return;const install=prompt;prompt=null;controls();try{await install.prompt();await install.userChoice;}catch{status('Use your browser installation menu or Safari Add to Home Screen.');}});
  lock();
  if(!window.isSecureContext||!crypto.subtle){input.disabled=true;status('Unlocking requires HTTPS or a localhost preview with browser encryption support.',true);return;}
  if(!navigator.serviceWorker){$('#offline-status').textContent='Offline installation is unavailable in this browser. Unlocking online can still be tested.';return;}
  navigator.serviceWorker.register(new URL('sw.js',document.baseURI),{scope:'./',updateViaCache:'none'}).then(async reg=>{registration=reg;controls();reg.addEventListener('updatefound',()=>{const worker=reg.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed')readiness();if(worker.state==='redundant')$('#offline-status').textContent='Offline download failed. The preceding release remains preserved.';controls();});});await navigator.serviceWorker.ready;await readiness();}).catch(()=>{$('#offline-status').textContent='Offline setup could not finish. Reconnect and reopen to retry.';});
})();
