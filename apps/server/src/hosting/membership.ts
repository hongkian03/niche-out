import { randomBytes, randomUUID } from 'node:crypto';
import { sessionRequest, controlGrant } from '@rarity/contracts';
type Input = ReturnType<typeof sessionRequest.parse>['page'];
type Grant = ReturnType<typeof controlGrant.parse>;
type Command = {tabId:string;requestId:string;gameId:string;serverInstanceId:string;payload:{mode?:string;explicit?:boolean}};
type Result = Grant | {error:string};
type Page = {input:Input;requestPrefix:string;used:boolean;last?:{requestId:string;kind:string;body:string;result:Result}};
/** Synthetic tab-control fixture adapted from the original probe. E3 owns the production ledger. */
export function makeMembership(sessionToken: string, serverInstanceId: string) {
  const pages = new Map<string, Page>();
  const gameId = randomUUID();
  let current: string | undefined;
  let generation = 0;
  let continuation: Grant['continuation'] | undefined;
  function matches(input: Input) {
    return input.kind === 'continuation' && continuation && input.record.serverInstanceId === serverInstanceId &&
      input.record.gameId === gameId && input.record.previousTabId === current &&
      input.record.continuationToken === continuation.continuationToken;
  }
  return {
    sessionToken,
    bootstrap(input: Input) {
      const tabId = randomUUID(); const requestPrefix = randomUUID();
      const classification = input.kind === 'fresh' ? 'fresh' : matches(input) ? 'continuation' : 'confirmation-required';
      pages.set(tabId, {input, requestPrefix, used:false});
      return {protocolVersion:1,serverInstanceId,role:'player',tabId,requestPrefix,hostGameId:null,lastGameCommit:null,resume:classification,
        membership:{gameId,playerId:'connection-member',nickname:'Connection check',status:'admitted'}};
    },
    command({tabId,requestId,gameId:requestedGame,serverInstanceId:instance,payload}: Command, kind: string): Result {
      const page=pages.get(tabId);
      if (!page || requestedGame!==gameId || instance!==serverInstanceId || !requestId.startsWith(page.requestPrefix+'.')) return {error:'UNAUTHORIZED'};
      if (kind==='game.resume' && page.used && current!==tabId) return {error:'TAB_SUPERSEDED'};
      if (page.last?.requestId===requestId && current!==tabId) return {error:'TAB_SUPERSEDED'};
      if (page.last?.requestId===requestId) return page.last.kind===kind && page.last.body===JSON.stringify(payload) ? page.last.result : {error:'REQUEST_ID_REUSE'};
      if (kind==='player.claimControl' && payload.explicit!==true) return {error:'INVALID_PAYLOAD'};
      if (kind==='game.resume' && current!==tabId) {
        if (payload.mode==='loaded') return {error:'TAB_SUPERSEDED'};
        if (page.input.kind!=='fresh' && !matches(page.input)) return {error:'CONTROL_CONFIRMATION_REQUIRED'};
      }
      if (current!==tabId) {current=tabId;generation++;continuation={serverInstanceId,gameId,previousTabId:tabId,continuationToken:randomBytes(32).toString('base64url')};}
      page.used=true;
      const result={controlGeneration:generation,continuation:continuation!};
      page.last={requestId,kind,body:JSON.stringify(payload),result};return result;
    }
  };
}
