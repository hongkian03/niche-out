import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {rewriteDocumentLinks,assertDocumentLinks} from './document-links.mjs';
test('package docs preserve installed links and external anchors, redirect only missing source docs',async()=>{
 const root=await mkdtemp(join(tmpdir(),'npm docs '));try{
  const stage=join(root,'stage'),sourceRoot=join(root,'source');await mkdir(join(stage,'docs'),{recursive:true});await mkdir(join(sourceRoot,'docs'),{recursive:true});
  await writeFile(join(stage,'docs/guide.md'),'[Local](local.md) [Source](omitted.md#anchor) [External](https://example.com/x#y) [Here](#here)');await writeFile(join(stage,'docs/local.md'),'local');await writeFile(join(sourceRoot,'docs/omitted.md'),'source');
  const args={stage,sourceRoot,files:['docs/guide.md','docs/local.md']};await rewriteDocumentLinks(args);await assertDocumentLinks(args);
  const content=await readFile(join(stage,'docs/guide.md'),'utf8');assert(content.includes('](local.md)'));assert(content.includes('blob/main/docs/omitted.md#anchor'));assert(content.includes('https://example.com/x#y'));assert(content.includes('](#here)'));
 }finally{await rm(root,{recursive:true,force:true});}
});
test('absent source references and root escapes fail packaging',async()=>{
 const root=await mkdtemp(join(tmpdir(),'npm docs '));try{const stage=join(root,'stage');await mkdir(stage);await writeFile(join(stage,'guide.md'),'[Missing](no-such-file.md)');await assert.rejects(rewriteDocumentLinks({stage,sourceRoot:root,files:['guide.md']}),/absent source/);await writeFile(join(stage,'guide.md'),'[Escape](../escape.md)');await assert.rejects(assertDocumentLinks({stage,files:['guide.md']}),/escapes/);}finally{await rm(root,{recursive:true,force:true});}
});
