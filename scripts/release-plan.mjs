// Review only. Local metadata cannot authorize publication or certify signing.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {targets} from './package-lib.mjs';
import {auditRelease} from './release-audit.mjs';
export function planRelease(config,audit=null){
 if(!config||config.schemaVersion!==2||config.distribution!=='npm'||config.productName!=='Niche Out'||!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/u.test(config.version??'')||!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u.test(config.packageName??''))throw Error('Invalid npm release configuration');
 if(config.hostNodeRange!=='>=24.22.3 <25')throw Error('Unsupported host runtime contract');
 const blockers=[],owner=config.ownerDecisions??{},signing=config.signing??{};
 if(!audit?.integrityPassed)blockers.push('Local npm candidate integrity audit required');
 if(audit?.artifact&&(audit.artifact.name!==config.packageName||audit.artifact.version!==config.version))blockers.push('Audited package identity differs from release configuration');
 for(const field of ['publisher','npmAccountOrOrganization','projectLicenseSpdx','copyrightNotice'])if(typeof owner[field]!=='string'||!owner[field].trim())blockers.push('Owner input deferred: '+field);
 if(owner.packageOwnershipVerified!==true)blockers.push('npm name/account ownership verification required');
 if(owner.assetRightsApproved!==true)blockers.push('Owner artwork/example rights approval deferred');
 if(owner.publicationDestination!=='https://registry.npmjs.org')blockers.push('Approved npm registry destination required');
 if(config.noticeReviewComplete!==true)blockers.push('Third-party notice review incomplete');
 for(const f of audit?.noticeFindings??[])if(f.kind!=='missing-license-metadata')blockers.push('Notice review required: '+f.path+' ('+f.kind+')');
 for(const field of ['macDeveloperId','macTeamId','macNotaryKeychainProfile','windowsCertificateThumbprint','windowsTimestampUrl','linuxOpenPgpFingerprint'])if(typeof signing[field]!=='string'||!signing[field].trim())blockers.push('Native signing configuration required: '+field);
 if(signing.windowsTimestampUrl&&!/^https:\/\/[^\s]+$/u.test(signing.windowsTimestampUrl))blockers.push('Timestamp service must use HTTPS');
 if(!Array.isArray(config.unimplementedPrerequisites))blockers.push('Native/npm prerequisite review missing');
 else blockers.push(...config.unimplementedPrerequisites.map(item=>'Implementation required: '+item));
 if(!config.publisherToolchain?.node||!config.publisherToolchain?.npm||config.publisherToolchain.trustedPublisherConfigured!==true)blockers.push('Separate pinned npm publisher toolchain/trusted-publisher setup required');
 for(const target of targets){const e=config.finalSignedTargetEvidence?.[target];if(!e||e.artifactSha256!==audit?.artifact?.sha256||!/^[a-f0-9]{64}$/u.test(e.artifactSha256??'')||!e.report)blockers.push('Final authenticated npm target evidence required: '+target)}
 blockers.push('Independent native authentication and target-report verification required (configuration is not evidence)');
 return {schemaVersion:2,distribution:'npm',product:config.productName,packageName:config.packageName,version:config.version,mode:'review-only',executionImplemented:false,publicReleaseReady:false,publicationAuthorized:false,localIntegrityPassed:audit?.integrityPassed===true,artifact:audit?.artifact??null,bindings:audit?.bindings??null,blockers,
 stages:[
 'S06: Build one npm candidate; audit actual tarball and source/native/connector/dependency/notices; freeze exact SHA-256 and npm integrity in this review',
 'S06: Resolve deferred account/publisher/rights inputs; reuse MIT source license; finish notice review',
 'S07-S09: Authenticate four native payload sets and demonstrate macOS notarization delivery, Windows signature/timestamp and persistent inventory signature',
 'S07-S10: Generate resource hashes after signing; pack final npm bytes; repeat tarball and installed clean-target checks; host Node is separate and connector preparation is explicit',
 'S11: Review exact authenticated candidate, deferred target/device/network evidence and pinned publisher setup; local checks require no already-published registry attestation',
 'S12: After separate authorization, publish exact reviewed tarball with approved provenance; verify registry version/integrity/attestations and installation before separately authorized stable promotion'
 ],note:'No signing, keychain access, credentials, account creation, upload or promotion occurs. Registry provenance is verified after authorized publication, not required to audit a local candidate.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const root=fileURLToPath(new URL('../',import.meta.url)),args=process.argv.slice(2);
 if(args.some(arg=>!/^--(?:config|out)=.+/u.test(arg)))throw Error('Usage: node scripts/release-plan.mjs [--config=path] [--out=path]; execution flags are unsupported');
 const config=JSON.parse(await readFile(resolve(root,args.find(a=>a.startsWith('--config='))?.slice(9)??'packaging/release/candidate.json'),'utf8'));
 const report=planRelease(config,await auditRelease(root,{candidate:config.artifactCandidate})),out=resolve(root,args.find(a=>a.startsWith('--out='))?.slice(6)??'work/release/npm-plan.json');
 await mkdir(dirname(out),{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));process.exitCode=1;
}
