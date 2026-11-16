/** Adapter boundary for E5. The host owns every handle until shutdown. */
export interface HostPlatform {
  /** One monotonic millisecond domain including time spent suspended. */
  nowMs(): number;
  /** Scope the request to active timed phases. Unavailable is a local notice. */
  requestIdleSleepPrevention(): Promise<
    { available: true; release(): Promise<void> } | { available: false; reason: string }
  >;
  /** Termination of the visible launcher, independently of any browser window. */
  onLauncherExit(shutdown: () => void): () => void;
}
