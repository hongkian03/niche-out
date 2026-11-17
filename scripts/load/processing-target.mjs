// Evaluate every retained measurement window; clearing observer samples must not
// erase a prior failure or turn unavailable measurements into a passing result.
const eligible = new Set(['STATE','JOINED','RESUMED','STARTED','ACCEPTED','REJECTED','CLOCK']);
export function processingTarget(finalByOutcome, checkpoints=[]) {
  const failures=groups=>Object.entries(groups).filter(([key,value])=>eligible.has(key.split(':')[1])&&value.p95Ms>=100).map(([key])=>key);
  const exceeded=failures(finalByOutcome);
  const retainedWindowFailures=checkpoints.flatMap(checkpoint=>failures(checkpoint.timings).map(key=>({afterGames:checkpoint.afterGames,key})));
  const measured=Object.keys(finalByOutcome).length>0||checkpoints.some(checkpoint=>Object.keys(checkpoint.timings).length>0);
  return {retainedWindowFailures,boundary:'handler entry to ack enqueue, excluding network and event-loop queue',targetP95Ms:100,passed:measured?exceeded.length===0&&retainedWindowFailures.length===0:null,exceeded};
}
