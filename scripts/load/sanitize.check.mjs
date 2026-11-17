import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeDiagnostic} from './sanitize.mjs';

test('assertion JSON redacts identities, capabilities and submitted wording while preserving failure codes', () => {
  const input = JSON.stringify({code:'STALE_REQUEST',requestId:'prefix.123',requestPrefix:'prefix',serverInstanceId:'server-private',tabId:'tab-private',candidateId:'candidate-private',continuationToken:'continuation-private',ownerToken:'owner-private',cookie:'cookie-private',credential:'credential-private',submittedText:'private answer',nested:{accessToken:'access-private'}});
  const result = sanitizeDiagnostic(input);
  for(const value of ['prefix.123','"prefix"','server-private','tab-private','candidate-private','continuation-private','owner-private','cookie-private','credential-private','private answer','access-private']) assert(!result.includes(value));
  assert(result.includes('STALE_REQUEST'));
  assert(result.includes('[redacted]'));
});

test('escaped JSON values are consumed completely instead of leaking a suffix', () => {
  const result = sanitizeDiagnostic(JSON.stringify({token:'first"\\secret-suffix',code:'REJECTED'}));
  assert(!result.includes('first'));
  assert(!result.includes('secret-suffix'));
  assert(result.includes('REJECTED'));
});

test('public/private URLs, query strings and header-style secrets are redacted', () => {
  const input='Failed https://private.example/owner#secret and http://127.0.0.1:7777/?access=one-use wss://socket.example/?access=socket-secret\nCookie: session=private-cookie\nAuthorization: Bearer private-token\npassword=private-password';
  const result=sanitizeDiagnostic(input);
  for(const value of ['private.example','127.0.0.1','one-use','socket.example','socket-secret','private-cookie','private-token','private-password']) assert(!result.includes(value));
  assert.equal((result.match(/\[redacted-url\]/g)??[]).length,3);
});

test('ordinary error codes and finite diagnostic length survive sanitation', () => {
  assert.equal(sanitizeDiagnostic('getaddrinfo ENOTFOUND'), 'getaddrinfo ENOTFOUND');
  assert.equal(sanitizeDiagnostic('operation has timed out'), 'operation has timed out');
  assert.equal(sanitizeDiagnostic(null), '');
  assert.equal(sanitizeDiagnostic('x'.repeat(1000)).length,300);
});
