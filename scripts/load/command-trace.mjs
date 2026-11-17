// Private run-local correlation. Neither the key nor raw request IDs are persisted.
import {createHmac} from 'node:crypto';
export function commandTag(key, requestId) {
  if (!key || typeof requestId !== 'string' || requestId.length > 256) return null;
  return createHmac('sha256', key).update(requestId).digest('hex').slice(0, 24);
}
export function ackRequestId(data) {
  if (typeof data !== 'string' || data.length > 16384 || !/^3[0-9]+\[/.test(data)) return null;
  try { const value=JSON.parse(data.slice(data.indexOf('['))); return typeof value[0]?.requestId === 'string' ? value[0].requestId : null; } catch { return null; }
}
export function boundedTrace(limit=50000) {
  const samples=[];let discarded=0;
  return {record(sample) {if(samples.length>=limit){discarded++;return;}const row={};for(const key of ['tag','edge','name','outcome','stage','atMs','transport','attempt','packetId'])if(sample[key]!==undefined)row[key]=sample[key];samples.push(row);},snapshot(){return {samples,discarded,limit};}};
}
