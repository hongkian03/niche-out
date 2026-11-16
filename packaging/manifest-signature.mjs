import {verify,createPublicKey} from 'node:crypto';
export function verifyManifestSignature(manifest,signature,publicKey) {
  let valid=false;
  try { valid=verify(null,manifest,createPublicKey(publicKey),signature); } catch {}
  if(!valid)throw new Error('Niche Out package: manifest signature is invalid. Extract a fresh, complete copy.');
}
