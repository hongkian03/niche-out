import { gamePackSchema, matchingKey, packFieldErrors, type DiveBand } from '@rarity/contracts';

export interface CompiledTier {
  readonly id: string;
  readonly name: string;
  readonly points: number;
}

export interface CompiledAnswer {
  readonly id: string;
  readonly index: number;
  readonly text: string;
  readonly tierId: string;
  readonly tierName: string;
  readonly points: number;
}

export interface CompiledPrompt {
  readonly id: string;
  readonly text: string;
  readonly index: number;
  readonly answers: readonly CompiledAnswer[];
  /** Server-private lookup. Never serialize a compiled definition as a view. */
  readonly match: (text: string) => CompiledAnswer | undefined;
  /** Server-private motion band for a positive award on this prompt. */
  readonly diveBand: (points: number) => DiveBand | undefined;
}

export interface CompiledPack {
  readonly schemaVersion: 1;
  readonly title: string;
  readonly settings: Readonly<{
    readingSeconds: number;
    answerSeconds: number;
    resultsSeconds: number;
  }>;
  readonly tiers: readonly CompiledTier[];
  readonly prompts: readonly CompiledPrompt[];
  readonly maximumTotalPoints: number;
}

export interface CompilationIssue {
  readonly path: readonly (string | number)[];
  readonly message: string;
}

export class PackCompilationError extends Error {
  readonly errors: readonly CompilationIssue[];

  constructor(errors: readonly CompilationIssue[]) {
    super('The game pack is invalid.');
    this.name = 'PackCompilationError';
    this.errors = Object.freeze(errors.map(error => Object.freeze({
      path: Object.freeze([...error.path]), message: error.message,
    })));
  }
}

interface PromptTransfer {
  readonly id: string;
  readonly text: string;
  readonly index: number;
  readonly answers: readonly CompiledAnswer[];
  readonly lookup: readonly (readonly [key: string, answerIndex: number])[];
}

/** Private worker IPC data, not a browser contract or an alternate upload format. */
export interface CompiledPackTransfer extends Omit<CompiledPack, 'prompts'> {
  readonly prompts: readonly PromptTransfer[];
}

// Runtime branding also prevents an arbitrary pack-shaped object from being committed.
const transfers = new WeakMap<CompiledPack, CompiledPackTransfer>();

export function isCompiledPack(value: unknown): value is CompiledPack {
  return typeof value === 'object' && value !== null && transfers.has(value as CompiledPack);
}

/** Compile once in the import worker. All normalization and ambiguity checks occur here. */
export function compilePack(input: unknown): CompiledPack {
  const parsed = gamePackSchema.safeParse(input);
  if (!parsed.success) throw new PackCompilationError(packFieldErrors(parsed.error));
  const pack = parsed.data;
  const tiers = new Map(pack.tiers.map(tier => [tier.id, tier]));
  const errors: CompilationIssue[] = [];
  let maximumTotalPoints = 0;
  const prompts = pack.prompts.map((prompt, promptIndex): PromptTransfer => {
    const lookup = new Map<string, number>();
    let maximumPoints = 0;
    const answers = prompt.answers.map((answer, answerIndex): CompiledAnswer => {
      const tier = tiers.get(answer.tierId)!; // Schema validates every reference.
      maximumPoints = Math.max(maximumPoints, tier.points);
      const add = (text: string, field: readonly (string | number)[]) => {
        const key = matchingKey(text);
        const existing = lookup.get(key);
        if (existing !== undefined && existing !== answerIndex) {
          errors.push({ path: ['prompts', promptIndex, 'answers', answerIndex, ...field],
            message: 'This normalized answer or alias is already assigned to answer ' + (existing + 1) + '.' });
        } else {
          lookup.set(key, answerIndex);
        }
      };
      add(answer.text, ['text']);
      answer.aliases.forEach((alias, index) => add(alias, ['aliases', index]));
      return { id: 'answer-' + promptIndex + '-' + answerIndex, index: answerIndex,
        text: answer.text, tierId: tier.id, tierName: tier.name, points: tier.points };
    });
    maximumTotalPoints += maximumPoints;
    return { id: prompt.id, text: prompt.text, index: promptIndex, answers, lookup: [...lookup] };
  });
  if (errors.length) throw new PackCompilationError(errors);
  return hydrateTrustedCompiledPack({ schemaVersion: 1, title: pack.title, settings: pack.settings,
    tiers: pack.tiers, prompts, maximumTotalPoints });
}

function calibrateDiveBands(answers: readonly CompiledAnswer[]): ReadonlyMap<number, DiveBand> {
  const positivePoints = new Set<number>();
  for (const answer of answers) if (answer.points > 0) positivePoints.add(answer.points);
  const ordered = [...positivePoints].sort((a, b) => a - b);
  // Rank the reachable scores, so an outlying award cannot flatten the visual scale.
  const bands = ['low', 'medium', 'high'] as const;
  return new Map(ordered.map((points, index) => [
    points, ordered.length === 1 ? 'medium' : bands[Math.round(2 * index / (ordered.length - 1))],
  ]));
}

/** Structured-cloneable output for the trusted import worker to send to its parent. */
export function serializeCompiledPack(pack: CompiledPack): CompiledPackTransfer {
  const transfer = transfers.get(pack);
  if (!transfer) throw new TypeError('Expected a compiled game pack.');
  return transfer;
}

/**
 * Reconstitute trusted compiler output after worker structured cloning. Do not call
 * this with browser/upload data: compilePack is the validation boundary. Rebuilds
 * lookup maps without reparsing, renormalizing, or recompiling the uploaded pack.
 * Copies and freezes transferred data so a caller cannot mutate an active game.
 */
export function hydrateTrustedCompiledPack(input: CompiledPackTransfer): CompiledPack {
  const data: CompiledPackTransfer = Object.freeze({
    schemaVersion: input.schemaVersion,
    title: input.title,
    settings: Object.freeze({ ...input.settings }),
    tiers: Object.freeze(input.tiers.map(tier => Object.freeze({ ...tier }))),
    maximumTotalPoints: input.maximumTotalPoints,
    prompts: Object.freeze(input.prompts.map(prompt => Object.freeze({
      id: prompt.id, text: prompt.text, index: prompt.index,
      answers: Object.freeze(prompt.answers.map(answer => Object.freeze({ ...answer }))),
      lookup: Object.freeze(prompt.lookup.map(([key, index]) => Object.freeze([key, index] as const))),
    }))),
  });
  const compiled: CompiledPack = Object.freeze({
    schemaVersion: data.schemaVersion, title: data.title, settings: data.settings,
    tiers: data.tiers, maximumTotalPoints: data.maximumTotalPoints,
    prompts: Object.freeze(data.prompts.map(prompt => {
      const lookup = new Map(prompt.lookup);
      const diveBands = calibrateDiveBands(prompt.answers);
      return Object.freeze({ id: prompt.id, text: prompt.text, index: prompt.index, answers: prompt.answers,
        diveBand: Object.freeze((points: number) => diveBands.get(points)),
        match: Object.freeze((text: string): CompiledAnswer | undefined => {
          const index = lookup.get(matchingKey(text));
          return index === undefined ? undefined : prompt.answers[index];
        }),
      });
    })),
  });
  transfers.set(compiled, data);
  return compiled;
}
