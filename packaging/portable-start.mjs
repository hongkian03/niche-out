// Private test signing boundary. Epic 6 authenticates this bootstrap with publisher signing.
import {readFile} from 'node:fs/promises';
import {verify,createPublicKey,createHash} from 'node:crypto';
__NICHE_VERIFY_FUNCTION__
const publicKey=__NICHE_TEST_PUBLIC_KEY__;
try {
  const manifestBytes=await readFile(new URL('../portable-manifest.json',import.meta.url));
  verifyManifestSignature(manifestBytes,await readFile(new URL('../portable-manifest.sig',import.meta.url)),publicKey);
  // Verify the builtin-only verifier before importing it; application dependencies load later.
  const verifierPath='apps/server/dist/hosting/resources.js';
  const entry=JSON.parse(manifestBytes).files.find(entry=>entry.path===verifierPath);
  const verifierBytes=await readFile(new URL('../'+verifierPath,import.meta.url));
  if(!entry||createHash('sha256').update(verifierBytes).digest('hex')!==entry.sha256)throw new Error('Niche Out package: resource verifier is corrupt. Extract a fresh copy.');
  const {verifyPortableResources}=await import('../'+verifierPath);
  await verifyPortableResources(undefined,{required:true});
  const {launchHosting}=await import('../apps/server/dist/hosting/launch.js');
  await launchHosting();
} catch(error) {
  console.error(error instanceof Error?error.message:'Niche Out could not start.');
  process.exitCode=1;
}
