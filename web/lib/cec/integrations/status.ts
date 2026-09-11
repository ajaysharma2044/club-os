// What is actually connected, said out loud.
//
// README-CEC.md makes one promise about this screen: "The interface says 'not
// configured' for these; it never fabricates connected status." This module is
// where that promise is either kept or broken, so it is written to fail in the
// safe direction every time. Every unknown resolves to "not connected". A row
// we cannot decrypt is not connected. A key that was working last week and has
// not been checked since is not connected. An expired token is not connected.
//
// WHY FOUR STATES AND NOT A BOOLEAN.
//
// A boolean forces a lie in both directions. "Connected: no" next to a
// perfectly configured Stripe key that nobody has clicked Connect on reads as
// broken software; "Connected: yes" next to a Google token that expired at 2am
// reads as working software right up to the moment an officer trusts it with an
// event. The four states are the four different things an officer has to do:
//
//   not_configured           -> a human must go and get credentials
//   configured_not_connected -> the credentials are here; press Connect
//   connected                -> nothing to do
//   expired                  -> reconnect, or wait for the automatic refresh
//
// Plus one that exists because the alternative is worse: `unreadable`, for a
// stored token this server's key cannot open. That happens when
// CEC_INTEGRATION_KEY is rotated, lost, or absent on a second machine. The
// tempting behaviour is to treat the row as connected because a row exists.
// That is the fabrication the README forbids, so it reports unreadable and asks
// for a reconnect.
//
// WHY AN API KEY IN THE ENVIRONMENT IS NOT "CONNECTED".
//
// Anyone can put STRIPE_SECRET_KEY=hello in a .env file. The presence of a
// string proves that somebody typed something, not that a provider will accept
// it. So a key-based integration is `configured` immediately and only becomes
// `connected` once a real call to the provider has succeeded and been recorded
// through `recordCheck`. Stale success is downgraded rather than trusted,
// because "it worked nine days ago" is not a claim about now.

import { db, fail, timestamp, officer, audit, type User } from "../db";
import {
  INTEGRATIONS,
  findIntegration,
  persistsToken,
  requiredEnv,
  scopeStrings,
  type Integration,
  type IntegrationCategory,
  type AuthMechanism,
  type SetupStep,
} from "./registry";
import {
  integrationsInit,
  tokenRow,
  isUnreadable,
  encryptionAvailable,
  KEY_ENV,
} from "./oauth";

export const INTEGRATION_STATES = [
  "not_configured",
  "configured_not_connected",
  "connected",
  "expired",
  "unreadable",
] as const;
export type IntegrationState = (typeof INTEGRATION_STATES)[number];

/**
 * How long a successful provider call vouches for a key-based integration.
 * A day, because that is roughly the granularity at which a club would notice
 * mail stopped sending, and because a longer window turns this screen into a
 * memorial to a connection that died on Tuesday.
 */
const CHECK_TTL_MS = 24 * 3600_000;

export type IntegrationStatus = {
  id: string;
  name: string;
  category: IntegrationCategory;
  auth: AuthMechanism;
  state: IntegrationState;
  /** every required environment variable is present */
  configured: boolean;
  /** invariant: exactly `state === "connected"`, never anything softer */
  connected: boolean;
  missingEnv: string[];
  /** names only. Values are never read into this payload. */
  presentEnv: string[];
  scopes: string[];
  accountLabel: string;
  expiresAt: string;
  /** when this answer was computed: it is a claim about this instant */
  lastCheckedAt: string;
  /** the last time the provider itself confirmed the connection works */
  lastVerifiedAt: string;
  /** one sentence an officer can act on */
  summary: string;
  nextStep: string;
  /** things standing in the way that are nobody's fault but must be named */
  blockers: string[];
  /** human setup steps this integration still requires */
  humanSteps: number;
};

// --- verification stamps ----------------------------------------------------
//
// Stored in the existing `settings` table rather than a new one, the same way
// assets.ts keeps expected-departure dates: one key per integration, no schema
// for a fact that is a single timestamp plus a boolean.

function checkKey(integrationId: string) {
  return `integration.check:${integrationId}`;
}

type CheckStamp = { at: string; ok: boolean; detail: string };

function lastCheck(integrationId: string): CheckStamp | null {
  const row = db()
    .prepare("SELECT value FROM settings WHERE key=?")
    .get(checkKey(integrationId)) as { value: string } | undefined;
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value) as CheckStamp;
    return typeof parsed?.ok === "boolean" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Record that we really talked to the provider, or really failed to. Callers
 * pass a short human detail — "sent test message", "401 invalid_api_key" — and
 * must never pass a response body, because a response body can carry a token.
 */
export function recordCheck(
  u: User,
  integrationId: string,
  ok: boolean,
  detail = "",
): CheckStamp {
  integrationsInit();
  if (!findIntegration(integrationId)) fail("Unknown integration.", 404);
  const stamp: CheckStamp = {
    at: timestamp(),
    ok,
    detail: String(detail).slice(0, 200),
  };
  db()
    .prepare(
      "INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    )
    .run(checkKey(integrationId), JSON.stringify(stamp));
  audit(u, "integration.checked", integrationId, { ok, detail: stamp.detail });
  return stamp;
}

// --- status -----------------------------------------------------------------

function missingFor(i: Integration): string[] {
  return requiredEnv(i).filter((name) => !String(process.env[name] || "").trim());
}

function presentFor(i: Integration): string[] {
  return i.env
    .map((e) => e.name)
    .filter((name) => String(process.env[name] || "").trim() !== "");
}

/**
 * The one function whose correctness the product claim rests on.
 *
 * Read it as a ladder: each rung can only ever move an integration further away
 * from "connected". There is no branch that promotes.
 */
export function statusOf(integrationId: string): IntegrationStatus {
  const i = findIntegration(integrationId);
  if (!i) fail("Unknown integration.", 404);
  integrationsInit();
  const now = timestamp();
  const missingEnv = missingFor(i!);
  const configured = missingEnv.length === 0;
  const blockers: string[] = [];

  let state: IntegrationState = configured
    ? "configured_not_connected"
    : "not_configured";
  let accountLabel = "";
  let expiresAt = "";
  let lastVerifiedAt = "";
  let summary = "";
  let nextStep = "";

  if (persistsToken(i!) && !encryptionAvailable())
    blockers.push(
      `${KEY_ENV} is not set, so a token could not be stored even after a successful consent. Generate one with: openssl rand -hex 32`,
    );
  for (const s of i!.setup) if (s.caveat) blockers.push(`${s.what} — ${s.caveat}`);

  if (!configured) {
    summary = `Not configured. ${i!.name} needs ${missingEnv.length === 1 ? "one setting" : `${missingEnv.length} settings`} that nobody has supplied yet: ${missingEnv.join(", ")}.`;
    nextStep = `Work through the setup checklist for ${i!.name}; it ends with putting ${missingEnv.join(" and ")} in the server environment.`;
    // Deliberately no provider lookup, no token read. An unconfigured
    // integration cannot become connected by anything this function does.
    return {
      id: i!.id,
      name: i!.name,
      category: i!.category,
      auth: i!.auth,
      state,
      configured,
      connected: false,
      missingEnv,
      presentEnv: presentFor(i!),
      scopes: scopeStrings(i!),
      accountLabel,
      expiresAt,
      lastCheckedAt: now,
      lastVerifiedAt,
      summary,
      nextStep,
      blockers,
      humanSteps: i!.setup.length,
    };
  }

  if (persistsToken(i!)) {
    const row = tokenRow(i!.id);
    if (!row) {
      summary = `Configured but not connected. The credentials for ${i!.name} are on the server, and nobody has completed the consent screen yet.`;
      nextStep = `An officer opens ${i!.name} on this screen and presses Connect, then approves the listed scopes.`;
    } else if (isUnreadable(row)) {
      state = "unreadable";
      summary = `Not connected. A stored ${i!.name} connection exists but this server cannot decrypt it, which happens when ${KEY_ENV} is changed, lost, or missing on this machine.`;
      nextStep = `Restore the original ${KEY_ENV}, or disconnect ${i!.name} and connect it again.`;
      accountLabel = row.account_label;
    } else {
      accountLabel = row.account_label;
      expiresAt = row.expires_at;
      lastVerifiedAt = row.last_verified_at;
      const expired =
        Boolean(row.expires_at) && Date.parse(row.expires_at) <= Date.now();
      if (expired) {
        state = "expired";
        summary = row.refresh_enc
          ? `Not connected right now. The ${i!.name} token expired at ${row.expires_at}; it can be renewed automatically on the next use.`
          : `Not connected. The ${i!.name} token expired at ${row.expires_at} and there is no refresh token, so it cannot renew itself.`;
        nextStep = row.refresh_enc
          ? `Nothing, unless renewal fails; then reconnect ${i!.name}.`
          : `An officer reconnects ${i!.name}.`;
      } else {
        state = "connected";
        summary = `Connected${accountLabel ? ` as ${accountLabel}` : ""}, with ${row.scopes.split(" ").filter(Boolean).length} granted scope(s)${row.expires_at ? `, valid until ${row.expires_at}` : ""}.`;
        nextStep = "";
      }
    }
  } else {
    // Key-based, webhook-based and SAML integrations: no token to inspect, so
    // the only evidence that anything works is a recorded successful call.
    const check = lastCheck(i!.id);
    if (!check || !check.ok) {
      summary = `Configured but not connected. The settings for ${i!.name} are present${check ? `, and the last check failed (${check.detail || "no detail"})` : ", and no successful call to the provider has been recorded"}. A key in a file is not proof that the provider accepts it.`;
      nextStep = `Run a test call to ${i!.name}; it will record the result here.`;
      lastVerifiedAt = check?.ok ? check.at : "";
    } else if (Date.parse(check.at) + CHECK_TTL_MS <= Date.now()) {
      lastVerifiedAt = check.at;
      summary = `Configured, last confirmed working at ${check.at}. That is more than a day ago and has not been re-checked, so this screen will not call it connected.`;
      nextStep = `Run a test call to ${i!.name} to confirm it still works.`;
    } else {
      state = "connected";
      lastVerifiedAt = check.at;
      summary = `Connected. A call to ${i!.name} succeeded at ${check.at}.`;
      nextStep = "";
    }
  }

  return {
    id: i!.id,
    name: i!.name,
    category: i!.category,
    auth: i!.auth,
    state,
    configured,
    // Single source of truth for the boolean. It is derived from the state and
    // never assigned independently, so the two cannot drift apart.
    connected: state === "connected",
    missingEnv,
    presentEnv: presentFor(i!),
    scopes: scopeStrings(i!),
    accountLabel,
    expiresAt,
    lastCheckedAt: now,
    lastVerifiedAt,
    summary,
    nextStep,
    blockers,
    humanSteps: i!.setup.length,
  };
}

/** Every integration in the registry, in registry order. */
export function integrationStatus(): IntegrationStatus[] {
  integrationsInit();
  return INTEGRATIONS.map((i) => statusOf(i.id));
}

/**
 * The headline an officer sees. `notConnected` counts everything that is not
 * live, so the number can never flatter the system: an expired token and an
 * unreadable row both count against it.
 */
export function integrationSummary(): {
  total: number;
  connected: number;
  configuredNotConnected: number;
  notConfigured: number;
  notConnected: number;
  statement: string;
} {
  const all = integrationStatus();
  const connected = all.filter((s) => s.connected);
  const notConfigured = all.filter((s) => s.state === "not_configured");
  const configuredNotConnected = all.filter(
    (s) => s.state === "configured_not_connected",
  );
  return {
    total: all.length,
    connected: connected.length,
    configuredNotConnected: configuredNotConnected.length,
    notConfigured: notConfigured.length,
    notConnected: all.length - connected.length,
    statement: connected.length
      ? `${connected.length} of ${all.length} integrations are connected: ${connected.map((s) => s.name).join(", ")}. The rest are not.`
      : `No integrations are connected. ${notConfigured.length} of ${all.length} have no credentials on this server at all.`,
  };
}

// --- setup instructions -----------------------------------------------------

export type SetupChecklistItem = SetupStep & {
  /** we can tell this step is done, because the value it produces is present */
  done: boolean;
  /** unknowable from here: nothing on this server observes a Google console */
  verifiable: boolean;
};

export type SetupInstructions = {
  id: string;
  name: string;
  category: IntegrationCategory;
  auth: AuthMechanism;
  state: IntegrationState;
  /** the point of the whole exercise, in club terms */
  enables: string[];
  steps: SetupChecklistItem[];
  env: {
    name: string;
    required: boolean;
    secret: boolean;
    what: string;
    where: string;
    present: boolean;
  }[];
  scopes: { scope: string; why: string }[];
  forbiddenScopes: { scope: string; why: string }[];
  dataFlow: { outbound: string; inbound: string; neverMoves: string };
  blockers: string[];
  docs: string;
  /** stated plainly so no UI is tempted to render a Connect button that lies */
  note: string;
};

/**
 * The real checklist, so the integrations screen can show what a human must do
 * instead of a "Connect" button that throws.
 *
 * A step is marked done only when the value it produces is actually present in
 * the environment. Everything else is `verifiable: false` — this server cannot
 * see whether somebody configured a consent screen, and pretending it can is
 * the same class of lie as a fabricated connected badge.
 */
export function setupInstructions(integrationId: string): SetupInstructions {
  const i = findIntegration(integrationId);
  if (!i) fail("Unknown integration.", 404);
  const s = statusOf(i!.id);
  const present = new Set(s.presentEnv);
  return {
    id: i!.id,
    name: i!.name,
    category: i!.category,
    auth: i!.auth,
    state: s.state,
    enables: i!.enables,
    steps: i!.setup.map((step) => {
      const produced = (step.produces || "")
        .split(/\s+and\s+|,\s*/)
        .map((n) => n.trim())
        .filter((n) => /^CEC_[A-Z0-9_]+$/.test(n));
      return {
        ...step,
        verifiable: produced.length > 0,
        done: produced.length > 0 && produced.every((n) => present.has(n)),
      };
    }),
    env: i!.env.map((e) => ({ ...e, present: present.has(e.name) })),
    scopes: i!.scopes.map((sc) => ({ scope: sc.scope, why: sc.why })),
    forbiddenScopes: (i!.forbiddenScopes || []).map((sc) => ({
      scope: sc.scope,
      why: sc.why,
    })),
    dataFlow: i!.dataFlow,
    blockers: s.blockers,
    docs: i!.docs,
    note:
      "Every step on this list is a human act. Club OS cannot create an account, obtain a key, sign a university agreement or approve a consent screen, and no amount of code in this repository changes that. Until the steps are done, this integration reports its real state and nothing else.",
  };
}

// --- HTTP surface -----------------------------------------------------------

/**
 * Officer-facing actions. Everything returned here is metadata: there is no
 * action in this router that can put a token in a response body, and adding one
 * would break the tests in tests/integrations.mjs on purpose.
 */
export function integrations(u: User, action: string, b: any) {
  officer(u);
  integrationsInit();
  if (action === "status")
    return { summary: integrationSummary(), integrations: integrationStatus() };
  if (action === "setup")
    return setupInstructions(String(b?.id || "").slice(0, 64));
  if (action === "check")
    return recordCheck(
      u,
      String(b?.id || "").slice(0, 64),
      b?.ok === true,
      String(b?.detail || "").slice(0, 200),
    );
  fail("Unknown integration action.", 404);
}
