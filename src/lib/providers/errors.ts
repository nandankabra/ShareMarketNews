import type { SourceKey } from "@/lib/db/enums";

/**
 * Every upstream this app reads returns HTTP 200 when it fails. A wrong index
 * filename gives back an HTML error page; an expired NSE cookie gives back a
 * login page; an unknown Yahoo symbol gives back `{chart:{result:null}}`.
 * Status codes are therefore close to worthless here, and `kind` — decided by
 * looking at the body — is what callers actually branch on.
 */
export type ProviderErrorKind =
  /** Transport failed or timed out. Worth retrying. */
  | "NETWORK"
  /** Answered, but the body is not the shape we parse. Retrying will not help. */
  | "SHAPE"
  /** Bot defences: an HTML interstitial, a 401/403, an expired session. */
  | "BLOCKED"
  /** Answered correctly, saying the thing does not exist. */
  | "NOT_FOUND";

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly source: SourceKey;
  readonly status?: number;
  readonly detail?: string;

  constructor(args: {
    kind: ProviderErrorKind;
    source: SourceKey;
    message: string;
    status?: number;
    detail?: string;
  }) {
    super(args.message);
    this.name = "ProviderError";
    this.kind = args.kind;
    this.source = args.source;
    this.status = args.status;
    this.detail = args.detail;
  }

  /** True when a second attempt has a real chance of a different answer. */
  get retryable(): boolean {
    return this.kind === "NETWORK";
  }

  toString(): string {
    const parts = [`${this.kind}`, this.message];
    if (this.status) parts.push(`status=${this.status}`);
    if (this.detail) parts.push(this.detail.slice(0, 120));
    return parts.join(" · ");
  }
}

/** Bodies that begin with markup are an error page, whatever the status said. */
export function looksLikeHtml(body: string): boolean {
  const head = body.slice(0, 200).trimStart().toLowerCase();
  return head.startsWith("<!doctype") || head.startsWith("<html") || head.startsWith("<");
}
