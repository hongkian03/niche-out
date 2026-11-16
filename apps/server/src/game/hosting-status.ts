import type { HostingStatus, SessionHostingState } from '@rarity/contracts';
/** The game sees sanitized reachability only, never connector messages or secrets. */
export function gameHostingStatus(state: SessionHostingState): HostingStatus {
  if (state.status === 'ready' || state.status === 'reconnecting') {
    return { status: state.status, publicOrigin: state.publicOrigin };
  }
  if (state.status === 'starting' || state.status === 'idle') return { status: 'starting' };
  if (state.status === 'connecting') return { status: 'connecting' };
  return { status: 'failed', reason: state.status === 'failed' && state.reason === 'connector-exited' ? 'connector-exited' : 'unreachable' };
}
