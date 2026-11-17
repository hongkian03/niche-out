// Readable, aggregate baseline report; raw evidence remains alongside it.
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const directory=resolve(process.argv.find(x=>x.startsWith('--dir='))?.slice(6)??'work/network-baseline');
const suite=JSON.parse(await readFile(join(directory,'suite.json')));
const reports=[];
for(const run of suite.results){if(run.report)reports.push({...run,data:JSON.parse(await readFile(join(directory,run.report)))});}
const number=(value,digits=2)=>typeof value==='number'?value.toFixed(digits):'unavailable';
const mib=value=>typeof value==='number'?number(value/1024**2):'unavailable';
const lines=['# Networking baseline benchmark results','',`Started: ${suite.started}. Uplink: ${suite.uplink}.`, '',suite.scope,'',
'Processing measurements exclude pre-handler queueing and internet transit. End-to-end times include client transport/retries. Origin bytes exclude outer TLS/QUIC and provider-only rejected requests. Off mode intentionally has no handler/byte diagnostics. Fixtures use 0.2-second reading/results and early answer completion; this is accelerated synthetic traffic, not an event-duration simulation.','',
'| Run | Result | Accepted handler p95 ms | Accepted E2E p95 ms | App CPU s | App peak RSS MiB | Origin egress MiB | Recorded 429s |',
'| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |'];
const rollup=[];
for(const {label,report,data:r}of reports){
 const handler=r.summary?.serverByOutcome?.['answer.submit:ACCEPTED']?.p95Ms;
 const e2e=r.summary?.endToEndByOutcome?.['answer.submit:ACCEPTED']?.p95Ms;
 const cpu=r.server?.cpu?((r.server.cpu.user+r.server.cpu.system)/1e6):null;
 const edge429=r.transportErrors?.filter(error=>error.status===429).length??0;
 lines.push(`| ${label} | ${r.status} | ${number(handler)} | ${number(e2e)} | ${number(cpu)} | ${mib(r.server?.peakRssBytes)} | ${mib(r.config.instrumentation==='off'?undefined:r.server?.diagnostics?.upstreamTransport?.writtenBytes)} | ${edge429} |`);
 rollup.push({label,status:r.status,report,config:r.config,identity:r.identity,fixtureSha256:r.fixture?.sha256,workloadSha256:r.workloadSha256,acceptedHandlerP95Ms:handler??null,acceptedE2EP95Ms:e2e??null,applicationCpuSeconds:cpu,applicationPeakRssBytes:r.server?.peakRssBytes??null,originEgressBytes:r.server?.diagnostics?.upstreamTransport?.writtenBytes??null,edge429,failedActions:r.failedActions??[],failures:r.failures??[],instrumentation:r.server?.instrumentation??null,negotiatedTransports:r.negotiatedTransports??{},generator:r.generator??null,processResources:r.server?.processResources??null});

}
lines.push('','## Individual runs','');
for(const {label,report,data:r}of reports){
 lines.push(`### ${label}`,'',`[Raw report](${report}) · [Runner log](${label}.log)`,'',`Status: **${r.status}**. Diagnostics: ${r.config.instrumentation}. Actual successful transport openings: ${JSON.stringify(r.negotiatedTransports??{})}.`,
 `ACK retries: ${r.retries?.length??0}; recoveries: ${r.recoveries?.length??0}; failed actions: ${r.failedActions?.length??0}.`,'');
 for(const error of r.failures??[])lines.push(`- ${error.category??'failure'}: ${error.message}`);
 lines.push('','| Stage | Completed actions | E2E p95 ms | E2E maximum ms |','| --- | ---: | ---: | ---: |');
 for(const [stage,metric]of Object.entries(r.timingsByStage??{}))lines.push(`| ${stage} | ${metric.count} | ${number(metric.p95Ms)} | ${number(metric.maxMs)} |`);
 lines.push('','Stage boundaries and detailed profile breakdowns are in the raw report. Stage labels reflect workload ownership; deferred publications can cross a marker. Success percentiles omit failed actions, which are separately retained above and in raw evidence.','');
}
lines.push('## Interpretation limits','','Two runs per diagnostic mode expose order variability but do not establish statistical significance. Compare the counterbalanced runs, not one ratio. Modes have different measurement overhead: detailed serialization is additional diagnostic work. This suite exercises forced Node transports and must not be called a browser negotiation or physical-phone certification. Provider/network errors and functional assertions remain failures even when processing p95 passes.','');
await writeFile(join(directory,'REPORT.md'),lines.join('\n'));
await writeFile(join(directory,'rollup.json'),JSON.stringify({schemaVersion:1,started:suite.started,status:suite.status,runs:rollup},null,2)+'\n');
console.log('Report: '+join(directory,'REPORT.md'));
