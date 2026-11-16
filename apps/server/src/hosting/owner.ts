import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
const secret = () => randomBytes(32).toString('base64url');
const digest = (value: string) => createHash('sha256').update(value).digest();
const matches = (value: string, hash?: Buffer) => Boolean(hash && timingSafeEqual(digest(value), hash));
/** One local authority; 60-second bootstrap and 24-hour rolling credential expiry per the architecture session contract. */
export class OwnerAuthority {
  private pending?: { hash: Buffer; expiresAt: number };
  private credential?: { hash: Buffer; expiresAt: number };
  constructor(private now: () => number = () => performance.now()) {}
  mint(): string {
    const token = secret();
    this.pending = { hash: digest(token), expiresAt: this.now() + 60_000 };
    return token;
  }
  exchange(token: string, admittedPlayer: boolean): { credential: string } | { error: 'HOST_PLAYER_CONFLICT' | 'INVALID_BOOTSTRAP' } {
    if (!this.pending || this.now() >= this.pending.expiresAt || !matches(token, this.pending.hash)) return { error: 'INVALID_BOOTSTRAP' };
    if (admittedPlayer) return { error: 'HOST_PLAYER_CONFLICT' };
    this.pending = undefined;
    const credential = secret();
    this.credential = { hash: digest(credential), expiresAt: this.now() + 86_400_000 };
    return { credential };
  }
  authorized(value: string): boolean {
    const now = this.now();
    if (!this.credential || now >= this.credential.expiresAt) {
      this.credential = undefined;
      return false;
    }
    if (!matches(value, this.credential.hash)) return false;
    this.credential.expiresAt = now + 86_400_000;
    return true;
  }
  clear(): void { this.pending = undefined; this.credential = undefined; }
}
