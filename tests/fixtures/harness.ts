export class ManualClock {
  #time = 0;

  readonly now = (): number => this.#time;

  set(timeMs: number): void {
    if (!Number.isSafeInteger(timeMs) || timeMs < this.#time) {
      throw new RangeError('Advance to a safe integer millisecond at or after the current time.');
    }
    this.#time = timeMs;
  }
}

export function deterministicIds() {
  let sequence = 0;
  return (kind: string): string => kind + '-' + (++sequence);
}
