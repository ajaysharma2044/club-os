// The integration framework, against a real database.
// Run: node --experimental-strip-types --import ./tests/ts-resolve-register.mjs tests/integrations.mjs
//
// These tests exist to hold one product promise from README-CEC.md: "The
// interface says 'not configured' for these; it never fabricates connected
// status." Everything below is either a way of asking "could this ever claim
// connected when it is not", or a way of asking "could a token get out".
//
// No real credential appears here and no network call is made: every provider
// is a function that returns a canned response.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, randomBytes } from "node:crypto";

// The database must exist before any module imports db.ts, which resolves the
// path once and caches the connection.
const dir = mkdtempSync(join(tmpdir(), "cec-integrations-"));
process.env.CEC_DATABASE = join(dir, "integrations.sqlite");

const { db } = await import("../lib/cec/db.ts");
const {
  INTEGRATIONS,
  INTEGRATION_CATEGORIES,
  findIntegration,
  integrationIds,
  persistsToken,
  registryProblems,
  requiredEnv,
} = await import("../lib/cec/integrations/registry.ts");
const {
  KEY_ENV,
  beginAuthorization,
  consumeState,
  createVerifier,
  challengeFor,
  verifyChallenge,
  encrypt,
  decrypt,
  encryptionAvailable,
  exchangeCode,
  storeToken,
  tokenRow,
  accessTokenFor,
  connectionSummary,
  refreshConnection,
  revokeConnection,
  scrubSecrets,
  integrationsInit,
} = await import("../lib/cec/integrations/oauth.ts");
const {
  statusOf,
  integrationStatus,
  integrationSummary,
  setupInstructions,
  recordCheck,
  integrations,
} = await import("../lib/cec/integrations/status.ts");

let checks = 0;
const ok = (c, m) => {
  assert.ok(c, m);
  checks++;
};
const eq = (a, b, m) => {
  assert.deepEqual(a, b, m);
  checks++;
};

// --- fixtures ---------------------------------------------------------------

// Start from a known-empty environment. A developer's real .env must not be
// able to turn a "not configured" assertion green.
for (const i of INTEGRATIONS) for (const e of i.env) delete process.env[e.name];
delete process.env[KEY_ENV];

const KEY_A = randomBytes(32).toString("hex");
const KEY_B = randomBytes(32).toString("hex");
const officerUser = (() => {
  const id = randomUUID();
  db()
    .prepare(
      "INSERT INTO users(id,name,email,password,role,interests,shared) VALUES (?,?,?,?,?,'',0)",
    )
    .run(id, "Maya, President", `${id}@example.test`, "x:unusable", "officer");
  return {
    id,
    name: "Maya, President",
    email: `${id}@example.test`,
    role: "officer",
    interests: "",
    shared: 0,
  };
})();
const applicant = { ...officerUser, id: randomUUID(), role: "applicant" };

const jsonResponse = (status, body) => ({
  ok: status < 400,
  status,
  text: async () => JSON.stringify(body),
});
/** A provider that answers with whatever the test hands it, recording calls. */
const provider = (respond) => {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, init });
    return respond(url, init, calls.length);
  };
  f.calls = calls;
  return f;
};
const googleConfigured = () => {
  process.env.CEC_GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
  process.env.CEC_GOOGLE_CLIENT_SECRET = "TEST-CLIENT-SECRET-2f4c9";
  process.env.CEC_GOOGLE_CALENDAR_ID = "c_test@group.calendar.google.com";
};
const REDIRECT = "https://clubos.test/api/cec/integrations/google/callback";

integrationsInit();

// --- 1. the registry is honest about what it asks for -----------------------

eq(registryProblems(), [], `registry invariants: ${registryProblems().join(" | ")}`);

for (const id of [
  "google",
  "google_calendar",
  "slack",
  "discord",
  "canvas",
  "cornell_sso",
  "stripe",
  "groupme",
])
  ok(findIntegration(id), `registry covers ${id}`);
ok(
  ["postmark", "resend", "ses"].every((id) => findIntegration(id)),
  "registry covers all three email providers",
);
eq(
  new Set(integrationIds()).size,
  INTEGRATIONS.length,
  "integration ids are unique",
);
for (const c of INTEGRATION_CATEGORIES)
  ok(
    INTEGRATIONS.some((i) => i.category === c),
    `category ${c} has at least one integration`,
  );

// Every scope carries a real justification, and none of them reads a private
// conversation. This is the check that would have to be deleted, visibly, for
// scope creep to land.
for (const i of INTEGRATIONS) {
  for (const s of i.scopes) {
    ok(
      s.why && s.why.trim().length >= 40,
      `${i.id}: scope ${s.scope} justifies itself`,
    );
    ok(
      !s.readsPrivateMessages,
      `${i.id}: scope ${s.scope} does not read private messages`,
    );
  }
}
// The chat integrations must name the DM scopes they refuse, because a future
// maintainer's instinct when a feature needs message history is to add one.
for (const id of ["slack", "discord", "groupme"]) {
  const i = findIntegration(id);
  ok(
    (i.forbiddenScopes || []).some((f) => f.readsPrivateMessages),
    `${id} explicitly refuses a private-message scope`,
  );
}
const slack = findIntegration("slack");
for (const banned of ["im:history", "mpim:history", "groups:history", "search:read"])
  ok(
    !slack.scopes.some((s) => s.scope === banned),
    `slack does not request ${banned}`,
  );
ok(
  slack.scopes.some((s) => s.scope === "channels:history"),
  "slack reads only channels the club invites the bot into",
);
const canvas = findIntegration("canvas");
ok(
  canvas.scopes.every((s) => s.scope.startsWith("url:GET|")),
  "canvas is read-only: it never asks for a write scope",
);
ok(
  (canvas.forbiddenScopes || []).some((f) => /score|enrollments/.test(f.scope)),
  "canvas explicitly refuses grade access",
);
for (const i of INTEGRATIONS)
  ok(i.dataFlow.neverMoves.length > 20, `${i.id} says what never moves`);

// --- 2. nothing is connected before anyone does anything --------------------

let all = integrationStatus();
eq(all.length, INTEGRATIONS.length, "status covers every integration");
ok(
  all.every((s) => s.connected === false),
  "nothing reports connected on an empty server",
);
ok(
  all.every((s) => s.state === "not_configured"),
  "with no environment set, every integration is not_configured",
);
ok(
  all.every((s) => s.connected === (s.state === "connected")),
  "connected is exactly the connected state, for every row",
);
ok(
  all.every((s) => s.summary && s.nextStep),
  "every integration explains itself and says what to do next",
);
ok(
  all.every((s) => s.lastCheckedAt),
  "every status says when it was computed",
);
eq(
  integrationSummary().connected,
  0,
  "the headline count agrees: nothing is connected",
);
ok(
  /No integrations are connected/.test(integrationSummary().statement),
  "the headline says so in words",
);

// A partially configured integration is still not configured, and above all is
// still not connected.
process.env.CEC_GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
let cal = statusOf("google_calendar");
eq(cal.state, "not_configured", "one of three variables is not configured");
ok(!cal.connected, "a half-configured integration is never connected");
ok(
  cal.missingEnv.includes("CEC_GOOGLE_CLIENT_SECRET") &&
    cal.missingEnv.includes("CEC_GOOGLE_CALENDAR_ID"),
  "the status names exactly what is missing",
);
ok(
  cal.missingEnv.every((n) => requiredEnv(findIntegration("google_calendar")).includes(n)),
  "missing variables come from the registry, not from guesswork",
);
delete process.env.CEC_GOOGLE_CLIENT_ID;
eq(
  statusOf("google_calendar").state,
  "not_configured",
  "removing the variable again reports not_configured",
);

// --- 3. configured is not connected -----------------------------------------

googleConfigured();
process.env[KEY_ENV] = KEY_A;
cal = statusOf("google_calendar");
eq(cal.state, "configured_not_connected", "credentials present, consent not given");
ok(!cal.connected, "configured is not connected");
ok(
  /not connected/i.test(cal.summary),
  "the sentence an officer reads says not connected",
);
eq(tokenRow("google_calendar"), null, "no token exists yet");

// --- 4. PKCE round-trips and the challenge is really S256 -------------------

const verifier = createVerifier();
ok(verifier.length >= 43 && verifier.length <= 128, "verifier length is RFC 7636 legal");
ok(/^[A-Za-z0-9\-_]+$/.test(verifier), "verifier is unpadded base64url");
const challenge = challengeFor(verifier);
ok(/^[A-Za-z0-9\-_]+$/.test(challenge), "challenge is unpadded base64url");
ok(verifyChallenge(verifier, challenge), "verifier and challenge round-trip");
ok(!verifyChallenge(createVerifier(), challenge), "a different verifier does not match");
ok(!verifyChallenge(verifier, challengeFor(verifier + "x")), "a tampered challenge fails");
ok(challenge !== verifier, "the challenge is a hash, not the verifier in disguise");
ok(createVerifier() !== createVerifier(), "verifiers are random per flow");

// --- 5. the authorization URL is built from the registry --------------------

const begun = beginAuthorization(officerUser, "google_calendar", REDIRECT);
const authUrl = new URL(begun.url);
eq(authUrl.origin + authUrl.pathname, "https://accounts.google.com/o/oauth2/v2/auth", "authorize endpoint comes from the registry");
eq(authUrl.searchParams.get("code_challenge_method"), "S256", "PKCE method is S256");
eq(authUrl.searchParams.get("state"), begun.state, "state travels in the URL");
eq(authUrl.searchParams.get("redirect_uri"), REDIRECT, "redirect URI is echoed");
eq(
  authUrl.searchParams.get("scope"),
  "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy",
  "exactly the registry scopes, nothing added",
);
eq(authUrl.searchParams.get("access_type"), "offline", "provider extras are applied");
ok(
  !begun.url.includes(process.env.CEC_GOOGLE_CLIENT_SECRET),
  "the client secret never appears in a browser-visible URL",
);
ok(
  authUrl.searchParams.get("code_challenge").length >= 43,
  "a real challenge travels in the URL",
);
const inFlight = decrypt(
  db().prepare("SELECT verifier FROM integration_oauth_states").get().verifier,
);
ok(
  inFlight && !begun.url.includes(inFlight),
  "the PKCE verifier itself never leaves the server",
);
eq(
  challengeFor(inFlight),
  authUrl.searchParams.get("code_challenge"),
  "the URL carries the S256 challenge of the stored verifier",
);
assert.throws(
  () => beginAuthorization(applicant, "google_calendar", REDIRECT),
  /Officer access required/,
  "a club integration is an officer action",
);
checks++;
assert.throws(
  () => beginAuthorization(officerUser, "stripe", REDIRECT),
  /does not use OAuth/,
  "a key-based integration has no OAuth flow to start",
);
checks++;

// --- 6. state is single-use and rejects replay ------------------------------

const pending = consumeState(begun.state);
eq(pending.integrationId, "google_calendar", "the state remembers its integration");
eq(pending.redirectUri, REDIRECT, "the state remembers its redirect URI");
ok(verifyChallenge(pending.verifier, authUrl.searchParams.get("code_challenge")), "the stored verifier matches the challenge that was sent");
assert.throws(
  () => consumeState(begun.state),
  /already been used/,
  "replaying a consumed state is refused",
);
checks++;
assert.throws(
  () => consumeState("never-issued-state"),
  /already been used|not started here/,
  "an invented state is refused",
);
checks++;
// An expired state is refused even though the row is present.
const stale = beginAuthorization(officerUser, "google_calendar", REDIRECT);
db()
  .prepare("UPDATE integration_oauth_states SET expires_at=? WHERE expires_at>?")
  .run(Date.now() - 1000, 0);
assert.throws(
  () => consumeState(stale.state),
  /expired/,
  "an expired state cannot be completed",
);
checks++;

// The verifier is not sitting in the database in the clear once a key exists.
const freshFlow = beginAuthorization(officerUser, "google_calendar", REDIRECT);
const storedVerifier = db()
  .prepare("SELECT verifier FROM integration_oauth_states LIMIT 1")
  .get().verifier;
ok(storedVerifier.startsWith("gcm:"), "the in-flight verifier is encrypted at rest");

// --- 7. a full exchange stores a token and returns none ---------------------

const ACCESS = "ya29.FAKE-ACCESS-TOKEN-e7d1c4b09a";
const REFRESH = "1//FAKE-REFRESH-TOKEN-77aa21";
const google = provider(() =>
  jsonResponse(200, {
    access_token: ACCESS,
    refresh_token: REFRESH,
    expires_in: 3600,
    scope:
      "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy",
    token_type: "Bearer",
  }),
);
const summary = await exchangeCode(
  officerUser,
  { state: freshFlow.state, code: "auth-code-abc", accountLabel: "cec-officers@example.test" },
  google,
);
eq(summary.stored, true, "a calendar connection is stored");
eq(summary.renewable, true, "a refresh token was kept");
ok(
  !JSON.stringify(summary).includes(ACCESS),
  "the exchange result does not carry the access token",
);
ok(
  !JSON.stringify(summary).includes(REFRESH),
  "the exchange result does not carry the refresh token",
);
const sentBody = google.calls[0].init.body;
ok(sentBody.includes("code_verifier="), "PKCE verifier is sent on exchange");
ok(sentBody.includes("grant_type=authorization_code"), "correct grant type");
eq(google.calls[0].url, "https://oauth2.googleapis.com/token", "token endpoint from the registry");
eq(statusOf("google_calendar").state, "connected", "now it really is connected");
ok(statusOf("google_calendar").connected, "and says so");
eq(accessTokenFor("google_calendar"), ACCESS, "the token is retrievable for a provider call");

// --- 8. the token is nowhere it should not be -------------------------------

const everything = JSON.stringify({
  status: integrationStatus(),
  summary: integrationSummary(),
  setup: INTEGRATIONS.map((i) => setupInstructions(i.id)),
  connection: connectionSummary("google_calendar"),
  router: integrations(officerUser, "status", {}),
});
ok(!everything.includes(ACCESS), "no status payload contains the access token");
ok(!everything.includes(REFRESH), "no status payload contains the refresh token");
ok(
  !everything.includes(process.env.CEC_GOOGLE_CLIENT_SECRET),
  "no status payload contains the client secret",
);
ok(!everything.includes(KEY_A), "no status payload contains the encryption key");
ok(
  !/access_enc|refresh_enc/.test(everything),
  "no status payload leaks even the ciphertext column",
);
ok(
  integrationStatus().every((s) => !("token" in s) && !("accessToken" in s)),
  "the status type has no token-shaped field at all",
);
// The audit trail records that a connection happened, never what with.
const auditRows = db().prepare("SELECT details FROM audit").all();
ok(auditRows.length > 0, "connections are audited");
ok(
  auditRows.every((r) => !r.details.includes(ACCESS) && !r.details.includes(REFRESH)),
  "no audit row contains a token",
);
// And it is genuinely encrypted on disk, not merely absent from the API.
const raw = db()
  .prepare("SELECT access_enc,refresh_enc FROM integration_tokens WHERE integration_id=?")
  .get("google_calendar");
ok(!raw.access_enc.includes(ACCESS), "the access token is ciphertext on disk");
ok(!raw.refresh_enc.includes(REFRESH), "the refresh token is ciphertext on disk");
ok(raw.access_enc.startsWith("gcm:"), "AES-256-GCM, with its IV and tag");
eq(decrypt(encrypt("round trip")), "round trip", "encryption round-trips");
ok(decrypt("gcm:00:00:00") === null, "a corrupt blob decrypts to null, not an exception");

// No module in this framework may log. A token reaches a log exactly once and
// then it is in a log forever.
for (const f of ["registry.ts", "oauth.ts", "status.ts"]) {
  const src = readFileSync(new URL(`../lib/cec/integrations/${f}`, import.meta.url), "utf8");
  ok(
    !/\bconsole\.(log|error|warn|info|debug|trace|dir)\s*\(/.test(src),
    `${f} contains no console call`,
  );
}

// --- 9. a provider error never echoes a secret ------------------------------

const leaky = provider(() =>
  jsonResponse(400, {
    error: "invalid_grant",
    error_description: `rejected access_token=${ACCESS} for client_secret ${process.env.CEC_GOOGLE_CLIENT_SECRET}`,
  }),
);
const leakyFlow = beginAuthorization(officerUser, "google_calendar", REDIRECT);
await assert.rejects(
  () => exchangeCode(officerUser, { state: leakyFlow.state, code: "bad" }, leaky),
  (e) => {
    ok(!e.message.includes(ACCESS), "a provider error does not echo a token");
    ok(
      !e.message.includes(process.env.CEC_GOOGLE_CLIENT_SECRET),
      "a provider error does not echo the client secret",
    );
    ok(/invalid_grant/.test(e.message), "but it still says what went wrong");
    return true;
  },
);
checks++;
ok(
  !scrubSecrets(`{"access_token":"${ACCESS}"}`).includes(ACCESS),
  "scrubSecrets redacts a token in a JSON body",
);
ok(
  !scrubSecrets("the key is " + KEY_A).includes(KEY_A),
  "scrubSecrets redacts the encryption key by value",
);
ok(
  scrubSecrets("plain trouble") === "plain trouble",
  "scrubSecrets leaves an innocent message alone",
);
// A failed exchange must not have left the flow usable.
assert.throws(() => consumeState(leakyFlow.state), /already been used/, "a failed exchange still burns its state");
checks++;

// --- 10. expiry and key rotation both read as not connected -----------------

const expiring = provider(() =>
  jsonResponse(200, { access_token: "expired-token-value", expires_in: -60 }),
);
const expiringFlow = beginAuthorization(officerUser, "google_calendar", REDIRECT);
await exchangeCode(officerUser, { state: expiringFlow.state, code: "c" }, expiring);
const expiredStatus = statusOf("google_calendar");
eq(expiredStatus.state, "expired", "an elapsed token reports expired");
ok(!expiredStatus.connected, "expired is not connected");
eq(accessTokenFor("google_calendar"), null, "an expired token is not handed out");

const renewer = provider(() =>
  jsonResponse(200, { access_token: "renewed-token-value", expires_in: 3600 }),
);
storeToken(officerUser, "google_calendar", {
  accessToken: "old",
  refreshToken: "refresh-me",
  expiresInSeconds: -1,
});
await refreshConnection(officerUser, "google_calendar", renewer);
eq(statusOf("google_calendar").state, "connected", "a refresh restores the connection");
eq(accessTokenFor("google_calendar"), "renewed-token-value", "with the new token");
ok(
  connectionSummary("google_calendar").renewable,
  "the refresh token is kept when the provider does not send a new one",
);

process.env[KEY_ENV] = KEY_B;
const rotated = statusOf("google_calendar");
eq(rotated.state, "unreadable", "a rotated key makes the row unreadable");
ok(!rotated.connected, "unreadable is never connected");
ok(/decrypt/.test(rotated.summary), "and the summary says why");
eq(accessTokenFor("google_calendar"), null, "no token comes out under the wrong key");
process.env[KEY_ENV] = KEY_A;
eq(statusOf("google_calendar").state, "connected", "restoring the key restores the truth");

// --- 11. revocation actually clears the token -------------------------------

const revoker = provider(() => ({ ok: true, status: 200, text: async () => "{}" }));
const revoked = await revokeConnection(officerUser, "google_calendar", revoker);
eq(revoked.cleared, true, "revocation reports that it cleared the row");
eq(revoked.providerNotified, true, "and that the provider was told");
eq(tokenRow("google_calendar"), null, "the token row is gone");
eq(accessTokenFor("google_calendar"), null, "no token can be retrieved after revocation");
eq(connectionSummary("google_calendar"), null, "no connection summary survives");
eq(
  statusOf("google_calendar").state,
  "configured_not_connected",
  "and the status drops straight back to not connected",
);
ok(
  !JSON.stringify(integrationStatus()).includes("renewed-token-value"),
  "the revoked token is not lingering in any payload",
);
// Revocation is local-first: a provider that refuses still leaves us clean.
storeToken(officerUser, "google_calendar", { accessToken: "second-token", expiresInSeconds: 3600 });
const refuser = provider(() => {
  throw new Error("provider unreachable");
});
const refused = await revokeConnection(officerUser, "google_calendar", refuser);
eq(refused.cleared, true, "the local row goes even when the provider call fails");
eq(refused.providerNotified, false, "and we say the provider was not told");
eq(tokenRow("google_calendar"), null, "nothing is left behind");

// --- 12. identity providers are never stored --------------------------------

let identitySeen = "";
const idp = provider(() =>
  jsonResponse(200, { access_token: "identity-token-xyz", expires_in: 3600, scope: "openid" }),
);
const idFlow = beginAuthorization(officerUser, "google", REDIRECT);
const idResult = await exchangeCode(
  officerUser,
  {
    state: idFlow.state,
    code: "c",
    onIdentityToken: (t) => {
      identitySeen = t.accessToken;
    },
  },
  idp,
);
eq(identitySeen, "identity-token-xyz", "the sign-in handler sees the token once");
eq(idResult.stored, false, "and nothing is stored");
eq(tokenRow("google"), null, "an identity provider leaves no row");
ok(!persistsToken(findIntegration("google")), "the registry says identity does not persist");
assert.throws(
  () => storeToken(officerUser, "google", { accessToken: "x" }),
  /read once at sign-in and never stored/,
  "storing an identity token is refused outright",
);
checks++;
ok(
  !JSON.stringify(integrationStatus()).includes("identity-token-xyz"),
  "the identity token is in no payload",
);

// --- 13. no encryption key means no storage, and no pretending --------------

delete process.env[KEY_ENV];
ok(!encryptionAvailable(), "the key is gone");
assert.throws(
  () => storeToken(officerUser, "google_calendar", { accessToken: "x" }),
  /Refusing to store a token/,
  "a token is never written in the clear",
);
checks++;
assert.throws(
  () => beginAuthorization(officerUser, "google_calendar", REDIRECT),
  new RegExp(KEY_ENV),
  "and the flow refuses to start before the consent screen, not after",
);
checks++;
const keyless = statusOf("google_calendar");
ok(!keyless.connected, "no key, not connected");
ok(
  keyless.blockers.some((b) => b.includes(KEY_ENV)),
  "the missing key is named as a blocker",
);
process.env[KEY_ENV] = KEY_A;

// --- 14. a key in a file is not a connection --------------------------------

const STRIPE_KEY = "rk_test_FAKE_RESTRICTED_KEY_0099";
process.env.CEC_STRIPE_SECRET_KEY = STRIPE_KEY;
process.env.CEC_STRIPE_WEBHOOK_SECRET = "whsec_FAKE_0099";
let stripe = statusOf("stripe");
eq(stripe.state, "configured_not_connected", "an unverified key is only configured");
ok(!stripe.connected, "typing a key into a file does not connect anything");
ok(/not proof/.test(stripe.summary), "and the summary explains why");
ok(
  !JSON.stringify(stripe).includes(STRIPE_KEY),
  "the status names the variable, never its value",
);
ok(stripe.presentEnv.includes("CEC_STRIPE_SECRET_KEY"), "it names the variable");

recordCheck(officerUser, "stripe", true, "created a test checkout session");
stripe = statusOf("stripe");
eq(stripe.state, "connected", "a successful provider call is what connects it");
ok(stripe.lastVerifiedAt, "and the status says when that was");

recordCheck(officerUser, "stripe", false, "401 invalid_api_key");
stripe = statusOf("stripe");
ok(!stripe.connected, "a failed check disconnects it again");
eq(stripe.state, "configured_not_connected", "back to configured only");

// A success that is a week old is not a claim about now.
db()
  .prepare("UPDATE settings SET value=? WHERE key=?")
  .run(
    JSON.stringify({
      at: new Date(Date.now() - 9 * 86400e3).toISOString(),
      ok: true,
      detail: "old",
    }),
    "integration.check:stripe",
  );
stripe = statusOf("stripe");
ok(!stripe.connected, "a stale success does not report connected");
ok(/more than a day ago/.test(stripe.summary), "and says exactly how stale it is");

// --- 15. setup instructions are a real checklist ----------------------------

const instructions = setupInstructions("stripe");
ok(instructions.steps.length >= 3, "stripe has real human steps");
ok(
  instructions.steps.every((s) => s.what && s.where),
  "every step says what to do and where",
);
ok(
  instructions.steps.some((s) => s.caveat),
  "the steps that cannot be done in an afternoon say so",
);
ok(
  instructions.env.some((e) => e.present === true),
  "the checklist knows which variables are already set",
);
ok(
  !JSON.stringify(instructions).includes(STRIPE_KEY),
  "the checklist shows variable names, never values",
);
ok(
  /human act/.test(instructions.note),
  "the instructions say plainly that code cannot do these steps",
);
ok(
  instructions.forbiddenScopes.length > 0,
  "and they publish what we refuse to ask for",
);
const canvasSetup = setupInstructions("canvas");
ok(
  canvasSetup.steps.some((s) => s.by === "university"),
  "canvas names the steps only the university can take",
);
const ssoSetup = setupInstructions("cornell_sso");
ok(
  ssoSetup.blockers.some((b) => /agreement|review|sponsor/i.test(b)),
  "cornell SSO names the agreement nobody can write in code",
);
assert.throws(() => setupInstructions("nope"), /Unknown integration/, "unknown ids are refused");
checks++;
assert.throws(() => statusOf("nope"), /Unknown integration/, "and so are unknown statuses");
checks++;

// --- 16. the final sweep ----------------------------------------------------

all = integrationStatus();
ok(
  all.every((s) => s.connected === (s.state === "connected")),
  "after every scenario, connected still means exactly one thing",
);
ok(
  all.filter((s) => s.connected).length === 0,
  "and at the end of this run, with no live provider, nothing claims to be connected",
);
ok(
  !JSON.stringify(all).includes(ACCESS) && !JSON.stringify(all).includes(REFRESH),
  "no token survives anywhere in the final payload",
);
assert.throws(
  () => integrations(applicant, "status", {}),
  /Officer access required/,
  "the status router is officer-only",
);
checks++;

console.log(`integrations: ${checks} checks passed`);
