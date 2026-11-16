import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {productionPaths,inventory,launchers,sha256} from '../../scripts/package-lib.mjs';
test('production selection excludes development and workspace links',()=>{
 assert.deepEqual(productionPaths({packages:{'':{},'node_modules/server':{},'node_modules/compiler':{dev:true},'node_modules/@rarity/core':{link:true},'apps/server':{}}}),['node_modules/server']);
});
test('inventory is relative, deterministic and rejects symlink escape',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'niche package é '));try{
 await writeFile(join(dir,'data.txt'),'game');assert.deepEqual(await inventory(dir),[{path:'data.txt',sha256:sha256('game')}]);
 await symlink('/tmp',join(dir,'escape'));await assert.rejects(inventory(dir),/symlinks/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('portable launchers resolve their own folder and force bundled mode',()=>{
 for(const target of ['darwin-arm64','darwin-x64','linux-x64','win32-x64']){
 const body=Object.values(launchers(target))[0];assert.match(body,/NICHE_PORTABLE=1/);assert.match(body,/NODE_OPTIONS/);assert.doesNotMatch(body,/npm |curl |wget /);
 }
 assert.throws(()=>launchers('unsupported'));
});

import {generateKeyPairSync,sign} from 'node:crypto';
import {verifyManifestSignature} from '../../packaging/manifest-signature.mjs';
test('test signing rejects changed manifests, signatures and signing keys',()=>{
 const {publicKey,privateKey}=generateKeyPairSync('ed25519');
 const pem=publicKey.export({type:'spki',format:'pem'}),bytes=Buffer.from('{"files":[]}');
 const signature=sign(null,bytes,privateKey);
 verifyManifestSignature(bytes,signature,pem);
 assert.throws(()=>verifyManifestSignature(Buffer.from('{"files":[1]}'),signature,pem),/signature/);
 const corrupt=Buffer.from(signature);corrupt[0]^=1;
 assert.throws(()=>verifyManifestSignature(bytes,corrupt,pem),/signature/);
 assert.throws(()=>verifyManifestSignature(bytes,signature,generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'})),/signature/);
});
