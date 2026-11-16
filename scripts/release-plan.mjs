// Produces a reviewable plan only. There is deliberately no execute/upload mode.
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {targets} from './package-lib.mjs';

export function planRelease(config) {
  if (!config || config.schemaVersion !== 1 || config.productName !== 'Niche Out' || !/^\d+\.\d+\.\d+$/.test(config.version ?? '')) throw new Error('Invalid release configuration');
  const blockers = [];
  const owner = config.ownerDecisions ?? {};
  for (const field of ['publisher', 'projectLicenseSpdx', 'copyrightNotice']) if (typeof owner[field] !== 'string' || !owner[field].trim()) blockers.push('Owner decision required: ' + field);
  if (owner.assetRightsApproved !== true) blockers.push('Owner asset-rights approval required');
  if (config.noticeReviewComplete !== true) blockers.push('Third-party notice review incomplete');
  const signing = config.signing ?? {};
  for (const field of ['macDeveloperId', 'macTeamId', 'macNotaryKeychainProfile', 'windowsCertificateThumbprint', 'windowsTimestampUrl', 'linuxOpenPgpFingerprint']) if (typeof signing[field] !== 'string' || !signing[field].trim()) blockers.push('Signing configuration required: ' + field);
  if (signing.windowsTimestampUrl && !/^https:\/\/[^\s]+$/.test(signing.windowsTimestampUrl)) blockers.push('Timestamp service must use HTTPS');
  if (!Array.isArray(config.unimplementedPrerequisites)) blockers.push('Implementation prerequisite review missing');
  else blockers.push(...config.unimplementedPrerequisites.map(item => 'Implementation required: ' + item));
  for (const target of targets) {
    const evidence = config.finalSignedTargetEvidence?.[target];
    if (!evidence || !/^[a-f0-9]{64}$/.test(evidence.artifactSha256 ?? '') || typeof evidence.report !== 'string' || !evidence.report.trim()) blockers.push('Final signed target evidence required: ' + target);
  }
  return {
    schemaVersion: 1, product: config.productName, version: config.version,
    mode: 'review-only', executionImplemented: false, publicReleaseReady: false,
    blockers,
    stages: [
      'Freeze source/runtime/dependency manifest; rerun affected suites; build four private candidates using existing recipes',
      'Resolve notice/license/publisher decisions; finish authenticated launcher/container implementations',
      'Sign nested macOS executable code with approved Developer ID, secure timestamps and tested hardened-runtime entitlements',
      'Rebuild authenticated resource inventory after executable signing; verify connector integrity accepts only signed pinned payload',
      'Sign outer Mac app/container, notarize, inspect service log, staple and verify; retain final digest per CPU',
      'Sign/timestamp Windows native verifier with approved certificate; authenticate resource manifest before executing Node or JS; verify covered tampering',
      'Generate Linux detached publisher signature over final archive; verify original and controlled modified copy against published fingerprint',
      'Extract final signed outputs on declared clean targets; verify shutdown, no downloads, tunnel access and unavailable-provider feedback',
      'Bind reports to exact final hashes; request separate publication authorization only after mandatory checks pass'
    ],
    note: 'Configuration is not evidence. This planner never signs, notarizes, changes a keychain, or publishes. Valid populated fields cannot certify missing implementation or target tests.'
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length > 3 || (process.argv[2] && process.argv[2].startsWith('--'))) throw new Error('Usage: node scripts/release-plan.mjs [configuration.json]; execution flags are unsupported');
  const path = process.argv[2] ?? new URL('../packaging/release/candidate.json', import.meta.url);
  const report = planRelease(JSON.parse(await readFile(path, 'utf8')));
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 1; // No path in this preparation tool authorizes a public release.
}
