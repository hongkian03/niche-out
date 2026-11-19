import {readFile,writeFile,access} from 'node:fs/promises';
import {resolve,relative,dirname,isAbsolute} from 'node:path';
const exists=path=>access(path).then(()=>true,()=>false);
function destination(stage,file,raw) {
 if (/^[a-z][a-z0-9+.-]*:/i.test(raw)||raw.startsWith('#'))return null;
 const match=/^([^#?]*)(.*)$/.exec(raw),path=decodeURIComponent(match[1]);
 if(!path)return null;
 const absolute=resolve(dirname(resolve(stage,file)),path),within=relative(resolve(stage),absolute);
 if(within.startsWith('..')||isAbsolute(within))throw Error('Package document link escapes its root: '+file);
 return {absolute,within,suffix:match[2]};
}
/** Keep shipped links local; redirect omitted source/planning files to the repo. */
export async function rewriteDocumentLinks({stage,sourceRoot,files,sourceBase='https://github.com/hongkian03/niche-out/blob/main/'}) {
 for(const file of files.filter(file=>file.endsWith('.md'))){
  let content=await readFile(resolve(stage,file),'utf8');
  for(const match of [...content.matchAll(/\]\(([^)]+)\)/g)]){
   const raw=match[1],target=destination(stage,file,raw);if(!target||await exists(target.absolute))continue;
   if(!await exists(resolve(sourceRoot,target.within)))throw Error('Package document references an absent source file: '+target.within);
   const link=sourceBase+target.within.split(/[\\/]/).map(encodeURIComponent).join('/')+target.suffix;
   content=content.replace(']('+raw+')',']('+link+')');
  }
  await writeFile(resolve(stage,file),content);
 }
}
export async function assertDocumentLinks({stage,files}) {
 for(const file of files.filter(file=>file.endsWith('.md'))){
  const content=await readFile(resolve(stage,file),'utf8');
  for(const match of content.matchAll(/\]\(([^)]+)\)/g)){const target=destination(stage,file,match[1]);if(target&&!await exists(target.absolute))throw Error('Broken relative package link: '+file+' -> '+match[1]);}
 }
}
