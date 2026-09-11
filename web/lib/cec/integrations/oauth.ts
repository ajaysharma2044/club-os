// OAuth 2.0 with PKCE, driven entirely by the registry. No provider names below
// this line except in comments.
//
// ---------------------------------------------------------------------------
// WHAT WE STORE, WHERE, AND WHY. Read this before adding a column.
//
// assets.ts opens with the rule this file has to live under: WE DO NOT STORE
// CREDENTIALS, NOT ENCRYPTED, NOT "TEMPORARILY", NOT EVER. That rule is about a
// shared club password — the Instagram login pasted into the group chat. A
// password is a human's credential: it is reused elsewhere, it authenticates a
// person rather than an application, it cannot be scoped, it cannot be revoked
// without locking out everyone, and storing it puts the club's whole identity
// in one row. Nothing changes that calculus, so `location` still points at the
// vault and no secret column exists over there.
//
// An OAuth token is a different object, and the difference is not a loophole:
//
//   1. It is scoped. A Calendar token can write calendar events and cannot read
//      mail. A password grants the account.
//   2. It is revocable, unilaterally, by the person who granted it, from the
//      provider's own screen, without telling us — and the revocation takes
//      effect for us and for nobody else.
//   3. It is already a delegation. The officer granting it is delegating one
//      capability to an application, which is exactly what they think they are
//      doing when they press Allow.
//   4. It expires on its own.
//
// So the question is not "may we store a secret" but "can this feature exist
// without one". For a background connection — publish this event to the club
// calendar at 3am, post the reminder, deliver the mail — the answer is no. The
// work happens when no human is present, so something must hold the capability.
// The alternatives were considered and rejected:
//
//   - Ask the officer to re-consent per action: kills every background job and
//     trains people to click Allow reflexively, which is worse security.
//   - Keep tokens in memory only: this is one SQLite process behind a restart
//     policy; the calendar would silently stop working after every deploy and
//     the status screen would have to say "connected" about a dead connection.
//   - Push tokens to the client: hands a bearer credential to a browser.
//   - Use a managed secret store: correct, and this is the migration path. The
//     `encrypt`/`decrypt` pair below is the seam. Today the club has no vault,
//     no KMS and no budget, and an honest single-server design beats a fictional
//     one.
//
// Therefore: tokens live in `integration_tokens`, encrypted with AES-256-GCM
// under a key that is NEVER in the database. The key comes from the environment
// (CEC_INTEGRATION_KEY). A stolen database file is then useless on its own, and
// — the part that matters more — a leaked backup or a copied .sqlite in someone's
// Downloads folder does not become a live club calendar.
//
// Two consequences we accept deliberately:
//
//   - No key, no storage. `storeToken` refuses rather than falling back to
//     plaintext. A token at rest in the clear is precisely the credential-in-a-
//     file that assets.ts forbids.
//   - Key rotation invalidates connections. Every row records a fingerprint of
//     the key that wrote it, so if the key changes we report `unreadable` and
//     ask for a reconnect. We never report `connected` about a row we cannot
//     open. Guessing would be the one unforgivable bug in this file.
//
// AND THE CASE WHERE WE STORE NOTHING. An identity provider — sign in with
// Google, Cornell SSO — gives a token whose only purpose is to answer "who is
// this". That answer is consumed once, at the moment of sign-in, and becomes a
// Club OS session. Keeping the provider token afterwards would be holding a
// credential with no workflow behind it, which is how the club's password
// problem started. So `storeToken` refuses identity integrations outright, and
// `registry.persistsToken()` is the predicate.
//
// NEVER LOG A TOKEN. NEVER RETURN ONE TO A CLIENT. There is no console call in
// this file and there must never be one. Provider errors go through
// `scrubSecrets` before they are allowed into an Error message, because an
// error string ends up in logs, in a bug report, and on a screen.
// ---------------------------------------------------------------------------

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import {
  db,
  fail,
  hash,
  timestamp,
  officer,
  member,
  audit,
  type User,
} from "../db";
import {
  findIntegration,
  persistsToken,
  scopeStrings,
  type Integration,
} from "./registry";

/** Where the encryption key comes from. Deliberately not a database row. */
export const KEY_ENV = "CEC_INTEGRATION_KEY";

/** An authorization attempt is worthless after this; a human is at the keyboard. */
const STATE_TTL_MS = 10 * 60_000;

/** Refresh this long before expiry so a job does not start with a dying token. */
const REFRESH_MARGIN_MS = 60_000;

let ready = false;
export function integrationsInit() {
  if (ready) return;
  db().exec(`
-- One in-flight authorization. The state is stored hashed, exactly as sessions
-- are in db.ts: a leaked table must not let anyone complete a flow. The row is
-- DELETED on consumption, which is what makes replay impossible rather than
-- merely unlikely.
CREATE TABLE IF NOT EXISTS integration_oauth_states(
  state_hash TEXT PRIMARY KEY,
  integration_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  -- PKCE verifier. Encrypted when a key is available, prefixed 'plain:' when it
  -- is not: unlike a token this is single-use, expires in ten minutes, and is
  -- useless without an intercepted authorization code, so refusing to start a
  -- flow over it would be security theatre with a real cost.
  verifier TEXT NOT NULL,
  started_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS integration_state_expiry ON integration_oauth_states(expires_at);

-- One live connection per integration. Club-level on purpose: the calendar, the
-- Slack channel and the mail sender belong to the club, not to the officer who
-- happened to press Connect. A per-person token would recreate the cornellec.com
-- failure — the connection would graduate with its owner.
CREATE TABLE IF NOT EXISTS integration_tokens(
  integration_id TEXT PRIMARY KEY,
  -- which account a human would recognise, e.g. 'cec-officers@gmail.com'
  account_label TEXT NOT NULL DEFAULT '',
  -- scopes the provider actually granted, which is not always what we asked for
  scopes TEXT NOT NULL DEFAULT '',
  access_enc TEXT NOT NULL,
  refresh_enc TEXT NOT NULL DEFAULT '',
  expires_at TEXT NOT NULL DEFAULT '',
  connected_by TEXT NOT NULL,
  connected_at TEXT NOT NULL,
  refreshed_at TEXT NOT NULL DEFAULT '',
  -- fingerprint of the key that encrypted this row, so a rotated key reports
  -- 'unreadable' instead of a decrypt exception in a background job
  key_fingerprint TEXT NOT NULL DEFAULT '',
  -- last time the provider confirmed this connection actually works
  last_verified_at TEXT NOT NULL DEFAULT '');
`);
  // Additive migration for databases created before these columns existed.
  const cols = db()
    .prepare("PRAGMA table_info(integration_tokens)")
    .all() as { name: string }[];
  const has = (n: string) => cols.some((c) => c.name === n);
  if (!has("key_fingerprint"))
    db().exec(
      "ALTER TABLE integration_tokens ADD COLUMN key_fingerprint TEXT NOT NULL DEFAULT ''",
    );
  if (!has("last_verified_at"))
    db().exec(
      "ALTER TABLE integration_tokens ADD COLUMN last_verified_at TEXT NOT NULL DEFAULT ''",
    );
  ready = true;
}

// --- encryption -------------------------------------------------------------

/**
 * The key, or null when the operator has not set one. Null is a normal state,
 * not an error: a pilot with no integrations configured has no reason to hold
 * an encryption key, and the status screen says so in plain English.
 */
function key(): Buffer | null {
  const raw = process.env[KEY_ENV] || "";
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) return null; // 32 bytes, hex
  return Buffer.from(raw, "hex");
}

export function encryptionAvailable(): boolean {
  return key() !== null;
}

/**
 * Identifies the key without revealing it, so a row can say "I was written by a
 * different key" instead of throwing when the key is rotated. Truncated because
 * the full digest of a low-entropy key would be worth attacking; 16 hex
 * characters distinguish keys without being a useful verifier.
 */
export function keyFingerprint(): string {
  const k = key();
  return k ? createHash("sha256").update(k).digest("hex").slice(0, 16) : "";
}

/** AES-256-GCM. The IV is fresh per record and the tag is stored with it. */
export function encrypt(plaintext: string): string {
  const k = key();
  if (!k)
    fail(
      `No ${KEY_ENV} is set, so there is nowhere safe to put this. Generate one with: openssl rand -hex 32`,
    );
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k!, iv);
  const body = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return `gcm:${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${body.toString("hex")}`;
}

/**
 * Returns null rather than throwing when the blob cannot be opened. A caller
 * that cannot read a token must report an honest status, not crash a page.
 */
export function decrypt(blob: string): string | null {
  if (blob.startsWith("plain:")) return blob.slice(6);
  const k = key();
  if (!k) return null;
  const [tag, iv, auth, body] = blob.split(":");
  if (tag !== "gcm" || !iv || !auth || !body) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "hex"));
    d.setAuthTag(Buffer.from(auth, "hex"));
    return Buffer.concat([
      d.update(Buffer.from(body, "hex")),
      d.final(),
    ]).toString("utf8");
  } catch {
    return null; // wrong key, or someone edited the ciphertext
  }
}

// --- redaction --------------------------------------------------------------

const SECRET_FIELDS =
  /(access_token|refresh_token|id_token|client_secret|code_verifier|bot_token|authed_user|api_key)("?\s*[:=]\s*"?)([^"'&,\s}]{6,})/gi;

/**
 * Make a provider's response safe to put in an Error. Two passes, because
 * either one alone leaks: the field pass catches a token in a JSON error body
 * (some providers echo the request back), and the literal pass catches a secret
 * that arrived somewhere we did not anticipate.
 *
 * This is called on every provider response before it is allowed near an
 * exception message, because an error string outlives the request: it goes to
 * the log, into a screenshot, and into a bug report pasted in the group chat.
 */
export function scrubSecrets(text: string, extra: string[] = []): string {
  let out = String(text).replace(SECRET_FIELDS, "$1$2[redacted]");
  const literals = [process.env[KEY_ENV] || "", ...extra].filter(
    (s) => s && s.length >= 6,
  );
  for (const s of literals) out = out.split(s).join("[redacted]");
  return out;
}

// --- PKCE -------------------------------------------------------------------

function base64url(b: Buffer): string {
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 32 random bytes, base64url: 43 characters, inside RFC 7636's 43-128. */
export function createVerifier(): string {
  return base64url(randomBytes(32));
}

/** S256 challenge. The only method we implement; `plain` defeats the point. */
export function challengeFor(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest());
}

/**
 * Verify a challenge against a verifier in constant time. We are a confidential
 * client and the provider does this check, but the round-trip is asserted in
 * tests: a challenge built from a different hash silently degrades PKCE to
 * nothing, and nothing about the flow would visibly fail.
 */
export function verifyChallenge(verifier: string, challenge: string): boolean {
  const expected = Buffer.from(challengeFor(verifier));
  const given = Buffer.from(challenge);
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

// --- endpoints --------------------------------------------------------------

/**
 * Registry endpoints may carry a {CEC_ENV_VAR} placeholder, because a Canvas or
 * Shibboleth endpoint is per-institution and cannot be a constant. Resolution
 * fails loudly: a half-substituted URL would send an authorization code to a
 * host named "{CEC_CANVAS_BASE_URL}".
 */
export function resolveEndpoint(template: string): string {
  const out = template.replace(/\{([A-Z0-9_]+)\}/g, (_m, name: string) => {
    const v = process.env[name];
    if (!v) fail(`${name} is not set, so this integration has no endpoint yet.`);
    return String(v).replace(/\/+$/, "");
  });
  if (!/^https:\/\//.test(out) && !/^http:\/\/localhost/.test(out))
    fail("An integration endpoint must be https.");
  return out;
}

function clientCredentials(i: Integration): { id: string; secret: string } {
  const idVar = i.env.find((e) => /CLIENT_ID$/.test(e.name))?.name || "";
  const secretVar = i.env.find((e) => /CLIENT_SECRET$/.test(e.name))?.name || "";
  const clientId = process.env[idVar] || "";
  const clientSecret = process.env[secretVar] || "";
  if (!clientId || !clientSecret)
    fail(
      `${i.name} is not configured. Set ${idVar} and ${secretVar} on the server first.`,
    );
  return { id: clientId, secret: clientSecret };
}

// --- authorization ----------------------------------------------------------

export type Authorization = { url: string; state: string };

/**
 * Build the URL the human's browser goes to, and remember just enough to finish
 * the flow when they come back. Nothing here contacts the provider: that is the
 * browser's job, which is the whole point of the redirect dance.
 */
export function beginAuthorization(
  u: User,
  integrationId: string,
  redirectUri: string,
): Authorization {
  integrationsInit();
  const i = findIntegration(integrationId);
  if (!i) fail("Unknown integration.", 404);
  if (i!.auth !== "oauth2")
    fail(`${i!.name} does not use OAuth. See its setup steps instead.`);
  // An LMS connection is one member's own academic data and only that member can
  // grant it; every other integration is club property and is an officer act.
  if (i!.category === "lms") member(u);
  else officer(u);
  // Refuse before redirecting rather than after consent: sending someone through
  // a provider's consent screen and then failing to keep the result is the most
  // expensive possible moment to discover a missing key.
  if (persistsToken(i!) && !encryptionAvailable())
    fail(
      `${i!.name} cannot be connected until ${KEY_ENV} is set, because its token would have to be stored in the clear. Generate one with: openssl rand -hex 32`,
    );
  const { id: clientId } = clientCredentials(i!);

  const state = base64url(randomBytes(32));
  const verifier = createVerifier();
  const now = Date.now();
  db()
    .prepare("DELETE FROM integration_oauth_states WHERE expires_at<?")
    .run(now);
  db()
    .prepare(
      "INSERT INTO integration_oauth_states(state_hash,integration_id,redirect_uri,verifier,started_by,created_at,expires_at) VALUES (?,?,?,?,?,?,?)",
    )
    .run(
      hash(state),
      i!.id,
      redirectUri,
      encryptionAvailable() ? encrypt(verifier) : `plain:${verifier}`,
      u.id,
      timestamp(),
      now + STATE_TTL_MS,
    );

  const p = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: challengeFor(verifier),
    code_challenge_method: "S256",
  });
  const scopes = scopeStrings(i!);
  if (scopes.length) p.set("scope", scopes.join(" "));
  for (const [k, v] of Object.entries(i!.authorizeParams || {})) p.set(k, v);
  audit(u, "integration.authorize", i!.id, { scopes });
  return { url: `${resolveEndpoint(i!.authorizeUrl!)}?${p.toString()}`, state };
}

export type PendingState = {
  integrationId: string;
  redirectUri: string;
  verifier: string;
  startedBy: string;
};

/**
 * Single-use, enforced by the DELETE rather than by the SELECT.
 *
 * The check that matters is `changes === 1`. Two callbacks carrying the same
 * state can both pass the SELECT, but SQLite serialises writers, so exactly one
 * of them deletes the row and the other is refused. Validating on the read
 * instead would let a replayed callback through under concurrency, which is the
 * precise attack state exists to stop. A replay is either a double-clicked
 * browser or a captured callback and we cannot tell which, so both lose.
 */
export function consumeState(state: string): PendingState {
  integrationsInit();
  const key = hash(state);
  const row = db()
    .prepare(
      "SELECT integration_id,redirect_uri,verifier,started_by,expires_at FROM integration_oauth_states WHERE state_hash=?",
    )
    .get(key) as
    | {
        integration_id: string;
        redirect_uri: string;
        verifier: string;
        started_by: string;
        expires_at: number;
      }
    | undefined;
  const claimed =
    Number(
      db()
        .prepare("DELETE FROM integration_oauth_states WHERE state_hash=?")
        .run(key).changes,
    ) === 1;
  if (!row || !claimed)
    fail("This sign-in link has already been used or was not started here.", 400);
  if (row!.expires_at < Date.now())
    fail("This sign-in link expired. Start the connection again.", 400);
  const verifier = decrypt(row!.verifier);
  if (verifier === null)
    fail("This connection attempt cannot be completed on this server.", 400);
  return {
    integrationId: row!.integration_id,
    redirectUri: row!.redirect_uri,
    verifier: verifier!,
    startedBy: row!.started_by,
  };
}

// --- token exchange ---------------------------------------------------------

export type HttpResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
};
export type HttpFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<HttpResponse>;

const defaultFetch: HttpFetch = (url, init) =>
  fetch(url, init) as unknown as Promise<HttpResponse>;

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  // Slack answers 200 with ok:false; OAuth 2.0 answers 4xx with `error`.
  ok?: boolean;
  error?: string;
  error_description?: string;
};

async function post(
  f: HttpFetch,
  url: string,
  form: Record<string, string>,
  secrets: string[],
): Promise<TokenResponse> {
  const res = await f(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: new URLSearchParams(form).toString(),
  });
  const raw = await res.text();
  let body: TokenResponse;
  try {
    body = JSON.parse(raw) as TokenResponse;
  } catch {
    // The body is not JSON, so we cannot know what is in it. Report the status
    // and nothing else; echoing an unknown payload is how a token reaches a log.
    fail(`The provider returned an unreadable response (HTTP ${res.status}).`, 502);
  }
  if (!res.ok || body!.ok === false || body!.error)
    fail(
      scrubSecrets(
        `The provider refused the connection (HTTP ${res.status}): ${
          body!.error || "unknown_error"
        }${body!.error_description ? ` — ${body!.error_description}` : ""}`,
        secrets,
      ),
      502,
    );
  return body!;
}

/** What a caller is allowed to know about a connection. Never the token. */
export type ConnectionSummary = {
  integrationId: string;
  accountLabel: string;
  /** what the provider actually granted, which may be less than we asked for */
  grantedScopes: string[];
  expiresAt: string;
  connectedAt: string;
  /** true when the provider gave us something to refresh with */
  renewable: boolean;
  stored: boolean;
};

/**
 * Finish the flow. Returns a summary; the token itself goes straight into
 * storage (or straight to the caller's identity handler and then out of scope)
 * and is never part of the return value. That is asserted in tests.
 */
export async function exchangeCode(
  u: User,
  input: {
    state: string;
    code: string;
    /** an identity sign-in passes this to read the subject, then drops it */
    onIdentityToken?: (t: { accessToken: string; scope: string }) => void;
    accountLabel?: string;
  },
  f: HttpFetch = defaultFetch,
): Promise<ConnectionSummary> {
  integrationsInit();
  const pending = consumeState(input.state);
  const i = findIntegration(pending.integrationId);
  if (!i) fail("Unknown integration.", 404);
  const creds = clientCredentials(i!);
  const body = await post(
    f,
    resolveEndpoint(i!.tokenUrl!),
    {
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: pending.redirectUri,
      client_id: creds.id,
      client_secret: creds.secret,
      code_verifier: pending.verifier,
    },
    [creds.secret, pending.verifier],
  );
  const accessToken = body.access_token || "";
  if (!accessToken)
    fail("The provider did not return a token for this connection.", 502);
  const grantedScopes = (body.scope || scopeStrings(i!).join(" "))
    .split(/[\s,]+/)
    .filter(Boolean);

  if (!persistsToken(i!)) {
    // Identity: hand the token to the caller for one synchronous read and keep
    // nothing. The sign-in becomes a Club OS session; the provider credential
    // has no further purpose and therefore no business existing on this disk.
    input.onIdentityToken?.({ accessToken, scope: grantedScopes.join(" ") });
    audit(u, "integration.identity", i!.id, { scopes: grantedScopes });
    return {
      integrationId: i!.id,
      accountLabel: input.accountLabel || "",
      grantedScopes,
      expiresAt: "",
      connectedAt: timestamp(),
      renewable: false,
      stored: false,
    };
  }

  return storeToken(u, i!.id, {
    accessToken,
    refreshToken: body.refresh_token || "",
    expiresInSeconds: body.expires_in,
    grantedScopes,
    accountLabel: input.accountLabel || "",
  });
}

/**
 * Write a connection. Refuses without a key and refuses for identity providers;
 * both refusals are the file header's reasoning made executable.
 */
export function storeToken(
  u: User,
  integrationId: string,
  t: {
    accessToken: string;
    refreshToken?: string;
    expiresInSeconds?: number;
    grantedScopes?: string[];
    accountLabel?: string;
  },
): ConnectionSummary {
  integrationsInit();
  const i = findIntegration(integrationId);
  if (!i) fail("Unknown integration.", 404);
  if (!persistsToken(i!))
    fail(
      `${i!.name} authenticates a person, not the club. Its token is read once at sign-in and never stored.`,
    );
  if (!encryptionAvailable())
    fail(
      `Refusing to store a token without ${KEY_ENV}. An unencrypted credential on disk is exactly what the asset register forbids.`,
    );
  const now = timestamp();
  const expiresAt = t.expiresInSeconds
    ? new Date(Date.now() + t.expiresInSeconds * 1000).toISOString()
    : "";
  const scopes = (t.grantedScopes || scopeStrings(i!)).join(" ");
  db()
    .prepare(
      `INSERT INTO integration_tokens(integration_id,account_label,scopes,access_enc,refresh_enc,expires_at,connected_by,connected_at,key_fingerprint,last_verified_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(integration_id) DO UPDATE SET
         account_label=excluded.account_label,
         scopes=excluded.scopes,
         access_enc=excluded.access_enc,
         refresh_enc=excluded.refresh_enc,
         expires_at=excluded.expires_at,
         connected_by=excluded.connected_by,
         connected_at=excluded.connected_at,
         key_fingerprint=excluded.key_fingerprint,
         last_verified_at=excluded.last_verified_at`,
    )
    .run(
      i!.id,
      t.accountLabel || "",
      scopes,
      encrypt(t.accessToken),
      t.refreshToken ? encrypt(t.refreshToken) : "",
      expiresAt,
      u.id,
      now,
      keyFingerprint(),
      now,
    );
  // The audit row records that a connection happened and under which scopes.
  // It does not record the token, and no audit row ever may.
  audit(u, "integration.connected", i!.id, {
    scopes: scopes.split(" ").filter(Boolean),
    expires_at: expiresAt,
    account_label: t.accountLabel || "",
  });
  return {
    integrationId: i!.id,
    accountLabel: t.accountLabel || "",
    grantedScopes: scopes.split(" ").filter(Boolean),
    expiresAt,
    connectedAt: now,
    renewable: Boolean(t.refreshToken),
    stored: true,
  };
}

export type TokenRow = {
  integration_id: string;
  account_label: string;
  scopes: string;
  access_enc: string;
  refresh_enc: string;
  expires_at: string;
  connected_by: string;
  connected_at: string;
  refreshed_at: string;
  key_fingerprint: string;
  last_verified_at: string;
};

/**
 * The stored row, ciphertext included. Internal to this module and status.ts,
 * which reads only the metadata. Nothing that renders or serialises may call it
 * — that is what `connectionSummary` is for.
 */
export function tokenRow(integrationId: string): TokenRow | null {
  integrationsInit();
  return (
    (db()
      .prepare("SELECT * FROM integration_tokens WHERE integration_id=?")
      .get(integrationId) as TokenRow | undefined) || null
  );
}

/** True when a row exists but this server's key cannot open it. */
export function isUnreadable(row: TokenRow): boolean {
  if (!encryptionAvailable()) return true;
  if (row.key_fingerprint && row.key_fingerprint !== keyFingerprint()) return true;
  return decrypt(row.access_enc) === null;
}

/**
 * The access token, for the one caller that is about to make a provider request.
 * Not exported through any route, never serialised, never logged. Returns null
 * rather than throwing so a caller can degrade into an honest status.
 */
export function accessTokenFor(integrationId: string): string | null {
  const row = tokenRow(integrationId);
  if (!row) return null;
  if (row.expires_at && Date.parse(row.expires_at) - REFRESH_MARGIN_MS <= Date.now())
    return null; // expired: the caller must refresh first
  return decrypt(row.access_enc);
}

/** Metadata only. This is the shape that is safe to send anywhere. */
export function connectionSummary(integrationId: string): ConnectionSummary | null {
  const row = tokenRow(integrationId);
  if (!row) return null;
  return {
    integrationId: row.integration_id,
    accountLabel: row.account_label,
    grantedScopes: row.scopes.split(" ").filter(Boolean),
    expiresAt: row.expires_at,
    connectedAt: row.connected_at,
    renewable: Boolean(row.refresh_enc),
    stored: true,
  };
}

/**
 * Exchange the refresh token for a new access token. Providers differ on
 * whether they return a new refresh token; when one is absent we keep the
 * existing one rather than blanking the column, which would silently turn a
 * renewable connection into one that dies at the next expiry.
 */
export async function refreshConnection(
  u: User,
  integrationId: string,
  f: HttpFetch = defaultFetch,
): Promise<ConnectionSummary> {
  integrationsInit();
  const i = findIntegration(integrationId);
  if (!i) fail("Unknown integration.", 404);
  const row = tokenRow(integrationId);
  if (!row) fail(`${i!.name} is not connected.`, 409);
  const refresh = row!.refresh_enc ? decrypt(row!.refresh_enc) : null;
  if (!refresh)
    fail(
      `${i!.name} cannot be renewed automatically. An officer has to connect it again.`,
      409,
    );
  const creds = clientCredentials(i!);
  const body = await post(
    f,
    resolveEndpoint(i!.tokenUrl!),
    {
      grant_type: "refresh_token",
      refresh_token: refresh!,
      client_id: creds.id,
      client_secret: creds.secret,
    },
    [creds.secret, refresh!],
  );
  if (!body.access_token)
    fail("The provider did not return a renewed token.", 502);
  const now = timestamp();
  const expiresAt = body.expires_in
    ? new Date(Date.now() + body.expires_in * 1000).toISOString()
    : "";
  db()
    .prepare(
      "UPDATE integration_tokens SET access_enc=?,refresh_enc=?,expires_at=?,refreshed_at=?,key_fingerprint=?,last_verified_at=? WHERE integration_id=?",
    )
    .run(
      encrypt(body.access_token),
      body.refresh_token ? encrypt(body.refresh_token) : row!.refresh_enc,
      expiresAt,
      now,
      keyFingerprint(),
      now,
      integrationId,
    );
  audit(u, "integration.refreshed", integrationId, { expires_at: expiresAt });
  return connectionSummary(integrationId)!;
}

/**
 * Disconnect. The local row goes first and unconditionally.
 *
 * The ordering is the decision: telling the provider is a courtesy that can fail
 * (their API is down, the token is already dead, the network is out), and a
 * revocation that leaves the credential on our disk because someone else's
 * server returned 500 is not a revocation. So we delete, then make a best-effort
 * call, then report whether that call landed. The UI can then say "removed here;
 * also revoke it at Google if you want to be certain", which is true, instead of
 * "revoked", which might not be.
 */
export async function revokeConnection(
  u: User,
  integrationId: string,
  f: HttpFetch = defaultFetch,
): Promise<{ cleared: boolean; providerNotified: boolean }> {
  integrationsInit();
  const i = findIntegration(integrationId);
  if (!i) fail("Unknown integration.", 404);
  if (i!.category === "lms") member(u);
  else officer(u);
  const row = tokenRow(integrationId);
  const token = row ? decrypt(row.access_enc) : null;
  const cleared =
    Number(
      db()
        .prepare("DELETE FROM integration_tokens WHERE integration_id=?")
        .run(integrationId).changes,
    ) > 0;
  audit(u, "integration.revoked", integrationId, { had_token: Boolean(row) });

  let providerNotified = false;
  if (token && i!.revokeUrl) {
    try {
      const res = await f(resolveEndpoint(i!.revokeUrl), {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          authorization: `Bearer ${token}`,
        },
        body: new URLSearchParams({ token }).toString(),
      });
      providerNotified = res.ok;
    } catch {
      providerNotified = false; // the local deletion already happened
    }
  }
  return { cleared, providerNotified };
}
