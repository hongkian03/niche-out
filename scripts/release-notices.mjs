// Conservative source-runtime graph covers external server AND bundled browser code.
import {readFile,readdir,lstat,mkdir,writeFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {applyNoticeReview} from './release-notice-review.mjs';
import {productionPaths,sha256} from './package-lib.mjs';
export async function generateReleaseNotices(root,stage,sourceLock,runtimeLock){
  const paths=[...new Set([...productionPaths(sourceLock),'node_modules/esbuild'])].sort(),dependencies=[];
  for(const path of paths){
    const metadata=JSON.parse(await readFile(join(root,path,'package.json'),'utf8'));
    if(metadata.version!==sourceLock.packages[path]?.version)throw Error('Notice source differs from reviewed lock: '+path);
    const entry={path,name:metadata.name,version:metadata.version,declaredLicense:metadata.license??null,
      role:runtimeLock.packages[path]?'installed-runtime-and-source-graph':path==='node_modules/esbuild'?'build-tool-generated-helpers':'browser-source-graph',files:[],findings:[]};
    for(const name of (await readdir(join(root,path))).sort()){
      if(!/^(licen[sc]e|copying|notice)(?:\.|$|-)/iu.test(name)||!(await lstat(join(root,path,name))).isFile())continue;
      const bytes=await readFile(join(root,path,name)),destination='release/notices/'+path+'/'+name;
      await mkdir(dirname(join(stage,destination)),{recursive:true});await writeFile(join(stage,destination),bytes);
      entry.files.push({path:destination,sha256:sha256(bytes)});
    }
    if(!entry.files.length)entry.findings.push('Complete standalone license/notice text absent in installed upstream package; permission-text review required');
    if(!entry.declaredLicense)entry.findings.push('Upstream metadata omits license identifier; inspect included text');
    dependencies.push(entry);
  }
  const connectorReview=await applyNoticeReview(root,stage,dependencies);
  const result={schemaVersion:1,scope:'Conservative reviewed source production graph plus generated-helper build-tool notice. Browser graph may include conditional code omitted by bundling; this is coverage, not exact module attribution or legal clearance.',
    sourceLockSha256:sha256(await readFile(join(root,'package-lock.json'))),runtimeShrinkwrapSha256:sha256(await readFile(join(stage,'npm-shrinkwrap.json'))),dependencies,
    assets:[{path:'apps/web/dist/VT323-OFL.txt',license:'OFL-1.1'},{path:'apps/web/dist/asset-notices.txt',license:'Project original artwork; owner approved MIT distribution November 19, 2026'}],
    connector:{distribution:'Not bundled. Explicit preparation downloads the pinned upstream executable unchanged.',catalogue:'scripts/cloudflared-manifest.json',license:'scripts/notices/cloudflared-LICENSE.txt',...connectorReview},reviewComplete:dependencies.every(d=>d.files.length>0)&&connectorReview.linkedDependencyNoticeReview==='complete'};
  await mkdir(join(stage,'release'),{recursive:true});await writeFile(join(stage,'release/notices.json'),JSON.stringify(result,null,2)+'\n');
  return result;
}
