// Review only. Local metadata cannot authorize publication or certify signing.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {auditRelease} from './release-audit.mjs';
export function planRelease(config,audit=null){
 if(!config||config.schemaVersion!==2||config.distribution!=='npm'||config.productName!=='Niche Out'||!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/u.test(config.version??'')||!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u.test(config.packageName??''))throw Error('Invalid npm release configuration');
 if(config.hostNodeRange!=='>=24.22.3 <25')throw Error('Unsupported host runtime contract');
 const blockers=[],owner=config.ownerDecisions??{};
 if(!audit?.integrityPassed)blockers.push('Local npm candidate integrity audit required');
 if(audit?.artifact&&(audit.artifact.name!==config.packageName||audit.artifact.version!==config.version))blockers.push('Audited package identity differs from release configuration');
 for(const field of ['publisher','npmAccountOrOrganization','projectLicenseSpdx','copyrightNotice'])if(typeof owner[field]!=='string'||!owner[field].trim())blockers.push('Owner input deferred: '+field);
 const access=config.npmAccessCheck;
 const newPackagePreflight=access?.registry==='https://registry.npmjs.org'&&access.packageName===config.packageName&&access.registryStatus===404&&access.whoamiExit===0&&access.accountMatches===true&&access.loggedInAccount===owner.npmAccountOrOrganization&&typeof access.checkedAt==='string';
 if(owner.packageOwnershipVerified!==true&&!newPackagePreflight)blockers.push('npm name/account ownership verification or new-package access preflight required');
 if(owner.assetRightsApproved!==true)blockers.push('Owner artwork/example rights approval deferred');
 if(owner.publicationDestination!=='https://registry.npmjs.org')blockers.push('Approved npm registry destination required');
 if(config.noticeReviewComplete!==true)blockers.push('Third-party notice review incomplete');
 for(const f of audit?.noticeFindings??[])if(f.kind!=='missing-license-metadata')blockers.push('Notice review required: '+f.path+' ('+f.kind+')');
 // Paid/native publisher authentication and hosted attestations are optional.
 // Existing OS-required/linker signatures stay untouched. This tool does not publish.
 const preparationReady=blockers.length===0;
 return {schemaVersion:2,distribution:'npm',product:config.productName,packageName:config.packageName,version:config.version,mode:'review-only',executionImplemented:false,publicReleaseReady:false,publicationAuthorized:false,preparationReady,localIntegrityPassed:audit?.integrityPassed===true,artifact:audit?.artifact??null,bindings:audit?.bindings??null,blockers,
 releaseScope:config.releasePolicy??null,
 optionalEnhancements:config.optionalEnhancements??[],
 requiredNextChecks:[
 'S10: Verify final exact installed npm bytes on declared qualified target(s); config fields are not execution evidence',
 'S11: Review actual game/mobile/recovery evidence, unresolved correctness/privacy/security defects and accurately scoped known limits',
 'S12: Obtain separate explicit approval, recheck account/name access, publish exact reviewed bytes, then verify registry integrity and installed published version'
 ],
 stages:[
 'S06: Audit exact tarball, source/lock/native/connector bindings, notices and approved release metadata',
 'S10: Fresh installed-package qualification on available Mac; retain linker/platform signatures and mark included other targets unverified until tested',
 'S11: Minimum release review with dated evidence and known limits; broad hardware/device/venue matrices and distribution polish are deferred',
 'S12: After explicit authorization, perform secure authenticated npm publication and exact-version registry/install readback; hosted provenance and staged promotion are optional'
 ],note:'Preparation readiness is not final release approval. This review-only tool never signs, reads keys or uploads. Optional signing/provenance and deferred unverified targets do not block a scoped initial release.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const root=fileURLToPath(new URL('../',import.meta.url)),args=process.argv.slice(2);
 if(args.some(arg=>!/^--(?:config|out)=.+/u.test(arg)))throw Error('Usage: node scripts/release-plan.mjs [--config=path] [--out=path]; execution flags are unsupported');
 const config=JSON.parse(await readFile(resolve(root,args.find(a=>a.startsWith('--config='))?.slice(9)??'packaging/release/candidate.json'),'utf8'));
 const report=planRelease(config,await auditRelease(root,{candidate:config.artifactCandidate})),out=resolve(root,args.find(a=>a.startsWith('--out='))?.slice(6)??'work/release/npm-plan.json');
 await mkdir(dirname(out),{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));process.exitCode=report.preparationReady?0:1;
}
