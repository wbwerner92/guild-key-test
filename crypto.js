'use strict';
((root)=>{
  const maxPackage=512*1024,maxKey=16*1024;
  function decode(value,max) {
    if(typeof value!=='string'||value.length>Math.ceil(max/3)*4||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))throw new Error('Invalid encrypted package encoding.');
    const bytes=Uint8Array.from(atob(value),character=>character.charCodeAt(0));
    if(bytes.length>max)throw new Error('Encrypted package exceeds its limit.');return bytes;
  }
  const header=value=>JSON.stringify({format:value.format,version:value.version,release:value.release,keyId:value.keyId,encryption:value.encryption,wrapping:value.wrapping});
  function checkEnvelope(value) {
    if(!value||value.format!=='guild-sealed-package'||value.version!==1||value.encryption!=='AES-256-GCM'||value.wrapping!=='RSA-OAEP-SHA256'||typeof value.release!=='string'||!/^[-\w .]{1,32}$/.test(value.release)||typeof value.keyId!=='string'||!/^[a-f0-9]{64}$/.test(value.keyId))throw new Error('This is not a supported encrypted prototype package.');
    if(decode(value.iv,12).length!==12||decode(value.wrappedKey,384).length!==384||decode(value.ciphertext,maxPackage).length<17)throw new Error('The encrypted package is incomplete.');
    return value;
  }
  async function open(value,privateFile,webCrypto=root.crypto) {
    checkEnvelope(value);
    if(!privateFile||privateFile.format!=='guild-prototype-private-key'||privateFile.version!==1||privateFile.algorithm!=='RSA-OAEP-SHA256'||privateFile.keyId!==value.keyId)throw new Error('Choose the private key file created for this prototype.');
    let privateBytes,plaintext;
    try {
      privateBytes=decode(privateFile.pkcs8,maxKey);
      const privateKey=await webCrypto.subtle.importKey('pkcs8',privateBytes,{name:'RSA-OAEP',hash:'SHA-256'},false,['unwrapKey']);
      privateBytes.fill(0);
      if(privateKey.algorithm.modulusLength!==3072)throw new Error('Unsupported key');
      const contentKey=await webCrypto.subtle.unwrapKey('raw',decode(value.wrappedKey,384),privateKey,{name:'RSA-OAEP'},{name:'AES-GCM',length:256},false,['decrypt']);
      plaintext=new Uint8Array(await webCrypto.subtle.decrypt({name:'AES-GCM',iv:decode(value.iv,12),additionalData:new TextEncoder().encode(header(value)),tagLength:128},contentKey,decode(value.ciphertext,maxPackage)));
      const app=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plaintext));
      if(app?.format!=='guild-sealed-demo'||app.version!==1||app.release!==value.release||!['html','css','js'].every(field=>typeof app[field]==='string'&&app[field].length<=128*1024))throw new Error('Invalid app');
      return app;
    } catch {throw new Error('Could not unlock this package. Check the private key file; the package may also be damaged.');}
    finally {privateBytes?.fill(0);plaintext?.fill(0);}
  }
  const api={open,checkEnvelope,header,maxPackage,maxKey};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GuildSealedCrypto=api;
})(globalThis);
