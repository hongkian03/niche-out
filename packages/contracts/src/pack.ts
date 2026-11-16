import { z } from 'zod';
import { codePointCount, trimOuterWhitespace } from './text.js';

function displayText(maximum: number) {
  return z.string()
    .refine(value => trimOuterWhitespace(value).length > 0, 'Enter a nonblank value.')
    .refine(value => codePointCount(value) <= maximum, 'Exceeds ' + maximum + ' Unicode code points.');
}

export const packIdSchema = displayText(64);
export const tierNameSchema = displayText(128);
export const promptTextSchema = displayText(4096);
export const answerTextSchema = displayText(512);
export const packTitleSchema = z.string().transform(trimOuterWhitespace).pipe(displayText(256));

export const phaseSecondsSchema = z.number().min(0.1).max(600).refine(
  value => Math.round(value * 1000) / 1000 === value,
  'Use a whole number of milliseconds.'
);

export const settingsSchema = z.strictObject({
  readingSeconds: phaseSecondsSchema.default(3),
  answerSeconds: phaseSecondsSchema.default(25),
  resultsSeconds: phaseSecondsSchema.default(10)
});

export const tierSchema = z.strictObject({
  id: packIdSchema,
  name: tierNameSchema,
  points: z.int().nonnegative()
});

const answerSchema = z.strictObject({
  text: answerTextSchema,
  tierId: packIdSchema,
  aliases: z.array(answerTextSchema).default([])
});

const promptSchema = z.strictObject({
  id: packIdSchema,
  text: promptTextSchema,
  answers: z.array(answerSchema).min(1)
});

export const gamePackSchema = z.strictObject({
  schemaVersion: z.literal(1),
  title: packTitleSchema.default('Custom Game'),
  settings: settingsSchema.prefault({}),
  tiers: z.array(tierSchema).min(1),
  prompts: z.array(promptSchema).min(1).max(20)
}).superRefine((pack, context) => {
  const tierPoints = new Map<string, number>();
  for (const [index, tier] of pack.tiers.entries()) {
    if (tierPoints.has(tier.id)) {
      context.addIssue({ code: 'custom', path: ['tiers', index, 'id'], message: 'Duplicate tier ID.' });
    }
    tierPoints.set(tier.id, tier.points);
  }

  const promptIds = new Set<string>();
  let maximumTotal = 0;
  for (const [index, prompt] of pack.prompts.entries()) {
    if (promptIds.has(prompt.id)) {
      context.addIssue({ code: 'custom', path: ['prompts', index, 'id'], message: 'Duplicate prompt ID.' });
    }
    promptIds.add(prompt.id);
    let maximum = 0;
    for (const [answerIndex, answer] of prompt.answers.entries()) {
      const points = tierPoints.get(answer.tierId);
      if (points === undefined) {
        context.addIssue({
          code: 'custom', path: ['prompts', index, 'answers', answerIndex, 'tierId'],
          message: 'Choose an existing tier ID.'
        });
      } else {
        maximum = Math.max(maximum, points);
      }
    }
    maximumTotal += maximum;
  }
  if (!Number.isSafeInteger(maximumTotal)) {
    context.addIssue({ code: 'custom', path: ['prompts'], message: 'Maximum game total exceeds the safe integer range.' });
  }
});

export type GamePackInput = z.input<typeof gamePackSchema>;
export type GamePack = z.output<typeof gamePackSchema>;

export function packFieldErrors(error: z.ZodError): { path: (string | number)[]; message: string }[] {
  return error.issues.flatMap(issue => {
    const path = issue.path.map(part => typeof part === 'number' ? part : String(part));
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map(key => ({ path: [...path, key], message: 'Unknown field.' }));
    }
    return [{ path, message: issue.message }];
  });
}
