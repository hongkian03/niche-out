import { matchingKey, type CompleteView } from '@rarity/contracts';

export type HostView = Extract<CompleteView, { viewRole: 'host' }>;
export type HostRoster = Extract<HostView, { phase: 'Lobby' }>['roster'];

/** Filtering never sorts or changes the admission-order source roster. */
export function filterHostRoster(roster: HostRoster, query: string): HostRoster {
  const needle = matchingKey(query);
  return needle ? roster.filter(player => matchingKey(player.nickname).includes(needle)) : roster;
}

export function formatFieldPath(path: (string | number)[]): string {
  return path.reduce<string>((text, part) => typeof part === 'number'
    ? `${text}[${part}]` : `${text}${text ? '.' : ''}${part}`, '') || 'Game file';
}

export function hostHasPlayer(view: HostView, playerId: string): boolean {
  if ('roster' in view) return view.roster.some(player => player.playerId === playerId);
  return view.phase === 'Finished' && view.standings.some(player => player.playerId === playerId);
}

export function hostPhaseLabel(view: HostView): string {
  if (view.phase === 'Reading') return 'Read the prompt';
  if (view.phase === 'Answering') return 'Answers open';
  if (view.phase === 'Results') return 'Round complete';
  if (view.phase === 'Finished') return 'Expedition complete';
  return view.phase === 'Lobby' ? 'Assemble your crew' : 'Prepare your expedition';
}
