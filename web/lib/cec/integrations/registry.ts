// Every integration Club OS intends to support, declared before any of them
// exists.
//
// WHY A DECLARATIVE REGISTRY AND NOT EIGHT HAND-WRITTEN CONNECTORS.
//
// README-CEC.md lists Google OAuth, Slack, Canvas, Cornell SSO, email delivery
// and payments as "not connected", and adds the binding product rule: "The
// interface says 'not configured' for these; it never fabricates connected
// status." A UI cannot honour that rule unless something enumerates what the
// full set is and what each one would need. Eight bespoke connectors give you
// eight different answers to "are we connected?", and the ninth screen invents
// a green dot because there was nothing to ask.
//
// So the registry is the single source of truth, and status.ts derives its
// answers from it rather than from anyone's memory. Adding an integration means
// adding a row here; if the row is honest, the status screen is honest.
//
// WHY SCOPES CARRY A JUSTIFICATION FIELD.
//
// A scope list with no `why` is how an app ends up reading a student's Gmail to
// "improve onboarding". Every scope below names the concrete club workflow that
// breaks without it, and `registryProblems()` fails the build if one does not.
// The rule is narrower than minimisation: docs/11 §"consent and control" says
// students react badly to discovering collection after the fact, and
// README-CEC.md commits in as many words to no "private-message mining". So a
// chat integration is scoped to the channels the club explicitly connects and
// never to anyone's DMs. `forbiddenScopes` records the scopes we deliberately
// do NOT request, with the reason, because the dangerous scope is the one a
// future maintainer adds quietly to fix a bug.
//
// WHAT THIS FILE CANNOT DO.
//
// Nothing here creates an account, obtains a key, signs a university agreement
// or clicks a consent screen. Those are human acts, and pretending otherwise is
// how a product ships a dead "Connect" button. Each entry therefore carries the
// exact human checklist in `setup`, which status.ts hands to the UI verbatim.

export const INTEGRATION_CATEGORIES = [
  "identity",
  "calendar",
  "chat",
  "lms",
  "email",
  "payments",
  "storage",
] as const;
export type IntegrationCategory = (typeof INTEGRATION_CATEGORIES)[number];

export const AUTH_MECHANISMS = ["oauth2", "api_key", "webhook", "none"] as const;
export type AuthMechanism = (typeof AUTH_MECHANISMS)[number];

/**
 * One permission we would ask a provider for, and the club workflow that fails
 * without it. `readsPrivateMessages` is a hard tripwire, not a warning label:
 * `registryProblems()` rejects any requested scope that sets it, so the only
 * place the flag may legitimately appear is `forbiddenScopes`.
 */
export type ScopeRequest = {
  /** the provider's exact scope string, as it goes on the wire */
  scope: string;
  /** the workflow that breaks without it; not a restatement of the scope name */
  why: string;
  /** true if granting it would expose messages between two people */
  readsPrivateMessages?: boolean;
};

export type ForbiddenScope = {
  scope: string;
  /** why we refuse it, in terms a club officer would recognise */
  why: string;
  readsPrivateMessages?: boolean;
};

export type EnvVar = {
  name: string;
  /** false for a variable with a working default or a provider-specific extra */
  required: boolean;
  /** a secret must never be logged, echoed to a client, or committed */
  secret: boolean;
  /** what it is */
  what: string;
  /** the exact page a human copies it from */
  where: string;
};

export type SetupStep = {
  /** who must physically do it; "founder" means nobody else can */
  by: "founder" | "club_officers" | "university" | "provider";
  what: string;
  /** the console, form or office where it happens */
  where: string;
  /** what the step yields, usually the value for an env var */
  produces?: string;
  /** a step that cannot be completed in an afternoon says so here */
  caveat?: string;
};

/**
 * What would actually move, in each direction, if this were connected. Written
 * so an officer can read it aloud at a general meeting. `neverMoves` is the
 * load-bearing half: it is the promise the scope list has to keep.
 */
export type DataFlow = {
  outbound: string;
  inbound: string;
  neverMoves: string;
};

export type Integration = {
  id: string;
  name: string;
  category: IntegrationCategory;
  auth: AuthMechanism;
  /** set when `auth` cannot describe the real protocol, e.g. SAML */
  protocol?: string;
  /** concrete club workflows this unlocks, not marketing */
  enables: string[];
  scopes: ScopeRequest[];
  forbiddenScopes?: ForbiddenScope[];
  env: EnvVar[];
  setup: SetupStep[];
  dataFlow: DataFlow;
  /** oauth2 endpoints; provider-agnostic code in oauth.ts reads these */
  authorizeUrl?: string;
  tokenUrl?: string;
  revokeUrl?: string;
  /** provider extras appended to the authorization URL (Google needs these) */
  authorizeParams?: Record<string, string>;
  /** inbound events we would subscribe to, and why */
  webhooks?: { event: string; why: string }[];
  /** members of the same group are alternatives: configure exactly one */
  exclusiveGroup?: string;
  /** provider documentation a human will need open while doing `setup` */
  docs: string;
};

// --- the registry -----------------------------------------------------------

export const INTEGRATIONS: Integration[] = [
  {
    id: "google",
    name: "Google (sign-in)",
    category: "identity",
    auth: "oauth2",
    enables: [
      "Sign in with the Google account a member already uses, instead of a twelfth password.",
      "Match a signup to the roster by verified email, so an applicant is not a second, duplicate person.",
    ],
    scopes: [
      {
        scope: "openid",
        why: "Returns the signed ID token that proves who authenticated. Without it there is no assertion to verify and sign-in cannot exist.",
      },
      {
        scope: "https://www.googleapis.com/auth/userinfo.email",
        why: "Email is the join key between a Google account and an existing Club OS user; without it every sign-in creates a duplicate record.",
      },
      {
        scope: "https://www.googleapis.com/auth/userinfo.profile",
        why: "Supplies a display name so an officer sees 'Maya Chen' on the roster rather than an opaque subject id.",
      },
    ],
    forbiddenScopes: [
      {
        scope: "https://www.googleapis.com/auth/gmail.readonly",
        why: "Reading a member's mailbox is exactly the private-message mining README-CEC.md rules out. Recruitment threads are not club data.",
        readsPrivateMessages: true,
      },
      {
        scope: "https://www.googleapis.com/auth/contacts.readonly",
        why: "A member's personal contacts are not a sponsor pipeline. Harvesting them would make the CRM a scraper.",
      },
    ],
    env: [
      {
        name: "CEC_GOOGLE_CLIENT_ID",
        required: true,
        secret: false,
        what: "OAuth 2.0 Web application client ID",
        where: "Google Cloud console, APIs & Services, Credentials",
      },
      {
        name: "CEC_GOOGLE_CLIENT_SECRET",
        required: true,
        secret: true,
        what: "Client secret for the same credential",
        where: "Google Cloud console, APIs & Services, Credentials",
      },
    ],
    setup: [
      {
        by: "founder",
        what: "Create a Google Cloud project for the club. Use a club-owned account, not a personal one, or the project graduates with its owner exactly like cornellec.com did.",
        where: "https://console.cloud.google.com/projectcreate",
      },
      {
        by: "founder",
        what: "Configure the OAuth consent screen: user type External, app name 'Club OS — Cornell EC', support email, and the three scopes above. Add the privacy-policy and terms URLs.",
        where: "APIs & Services, OAuth consent screen",
        caveat:
          "External apps stay in Testing until verified; only listed test users can sign in. Verification is a Google review with a turnaround measured in days.",
      },
      {
        by: "founder",
        what: "Create an OAuth client of type Web application with authorised redirect URI <CEC_ORIGIN>/api/cec/integrations/google/callback. The URI must match byte for byte, including the scheme.",
        where: "APIs & Services, Credentials, Create credentials",
        produces: "CEC_GOOGLE_CLIENT_ID and CEC_GOOGLE_CLIENT_SECRET",
      },
      {
        by: "founder",
        what: "Put both values in the server environment (.env.local in development, the host's secret store in production). Never commit them.",
        where: "web/.env.local or the deployment secret store",
      },
    ],
    dataFlow: {
      outbound:
        "Nothing. The browser is redirected to Google; Club OS sends only the client ID, the redirect URI and a random state.",
      inbound:
        "One ID token per sign-in, containing the Google subject id, verified email and display name.",
      neverMoves:
        "Mail, Drive contents, contacts and calendar. The token is exchanged, read once for identity, and discarded — it is never stored (see oauth.ts).",
    },
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    revokeUrl: "https://oauth2.googleapis.com/revoke",
    // access_type=online because an identity integration has no offline work to
    // do and therefore must not be issued a refresh token it would only have to
    // guard. prompt=select_account stops a shared lab machine silently signing
    // in as whoever used it last.
    authorizeParams: { access_type: "online", prompt: "select_account" },
    docs: "https://developers.google.com/identity/protocols/oauth2/web-server",
  },

  {
    id: "google_calendar",
    name: "Google Calendar (club calendar)",
    category: "calendar",
    auth: "oauth2",
    enables: [
      "Publish a published event to the club's shared calendar the moment it leaves draft, instead of an officer copying it by hand.",
      "Update or cancel the calendar entry when the event record changes, so the calendar and the record cannot disagree.",
      "Find a meeting time from officers' free/busy windows without anyone reading anyone's calendar.",
    ],
    scopes: [
      {
        scope: "https://www.googleapis.com/auth/calendar.events",
        why: "Creating, updating and cancelling the club's own event entries is the whole feature; this is the narrowest scope that can write an event.",
      },
      {
        scope: "https://www.googleapis.com/auth/calendar.freebusy",
        why: "Scheduling needs to know which hours are taken, not what is in them. This scope returns busy intervals only, which is strictly less than calendar.readonly would hand over.",
      },
    ],
    forbiddenScopes: [
      {
        scope: "https://www.googleapis.com/auth/calendar.readonly",
        why: "Returns the title, description and attendee list of every personal event. Scheduling needs busy intervals; reading 'therapy, 4pm' to book a coffee chat is surveillance.",
      },
      {
        scope: "https://www.googleapis.com/auth/calendar",
        why: "Full read/write over every calendar the account can see, including ones the club has nothing to do with. calendar.events is sufficient.",
      },
    ],
    env: [
      {
        name: "CEC_GOOGLE_CLIENT_ID",
        required: true,
        secret: false,
        what: "Same OAuth client as sign-in; one consent screen, two scopes sets",
        where: "Google Cloud console, APIs & Services, Credentials",
      },
      {
        name: "CEC_GOOGLE_CLIENT_SECRET",
        required: true,
        secret: true,
        what: "Client secret",
        where: "Google Cloud console, APIs & Services, Credentials",
      },
      {
        name: "CEC_GOOGLE_CALENDAR_ID",
        required: true,
        secret: false,
        what: "The club calendar's id, e.g. c_xxx@group.calendar.google.com. Naming it explicitly stops a misconfiguration writing club events into a person's primary calendar.",
        where: "Google Calendar, the calendar's Settings and sharing page",
      },
    ],
    setup: [
      {
        by: "club_officers",
        what: "Create a calendar owned by a club account (not a student's primary calendar) and give the officer role owner access. Record it in the asset register so it survives the handoff.",
        where: "https://calendar.google.com, Settings, Add calendar",
        produces: "CEC_GOOGLE_CALENDAR_ID",
      },
      {
        by: "founder",
        what: "Enable the Google Calendar API in the same Cloud project as sign-in.",
        where: "APIs & Services, Library, Google Calendar API",
      },
      {
        by: "founder",
        what: "Add the two calendar scopes to the consent screen. Both are sensitive scopes, so the app needs Google verification before anyone outside the test-user list can consent.",
        where: "APIs & Services, OAuth consent screen, Scopes",
        caveat:
          "Sensitive-scope verification requires a published privacy policy, a domain the club verifiably owns, and a demo video. The domain requirement is blocked until cornellec.com is transferred off the graduated president's personal registrar account.",
      },
      {
        by: "club_officers",
        what: "An officer connects the calendar once from the integrations screen and consents on Google's page. That single consent is what produces the stored token.",
        where: "Club OS, Settings, Integrations",
      },
    ],
    dataFlow: {
      outbound:
        "Event title, description, location, start and end for events an officer has published. Nothing from drafts, tasks, applications or messages.",
      inbound:
        "The calendar event id we just wrote, so a later edit updates rather than duplicates, plus busy intervals when scheduling.",
      neverMoves:
        "Event titles or attendees from anyone's personal calendar; recruitment records; member emails.",
    },
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    revokeUrl: "https://oauth2.googleapis.com/revoke",
    // A calendar connection must keep working after the officer closes the tab,
    // so this one does need a refresh token. consent forces Google to reissue it
    // rather than returning only an access token on a repeat authorisation.
    authorizeParams: { access_type: "offline", prompt: "consent" },
    docs: "https://developers.google.com/calendar/api/guides/auth",
  },

  {
    id: "slack",
    name: "Slack",
    category: "chat",
    auth: "oauth2",
    enables: [
      "Post an event announcement to the one channel the club connects, with the RSVP link, instead of an officer retyping it.",
      "Turn a decision made in the connected channel into a meeting proposal in the existing chat-to-schedule flow.",
      "Nudge a task owner in channel when a deadline passes, rather than in a DM nobody can audit.",
    ],
    scopes: [
      {
        scope: "channels:read",
        why: "Lists the public channels the workspace has so an officer can pick which one to connect. Without it the connect screen would demand a channel id typed from memory.",
      },
      {
        scope: "chat:write",
        why: "Posting the announcement is the feature. Slack restricts this token to channels the bot has been invited to.",
      },
      {
        scope: "channels:history",
        why: "Reads messages only in public channels the bot was explicitly invited to, which is how a decision in the connected channel becomes a meeting proposal. Uninviting the bot ends the access immediately and visibly.",
      },
    ],
    forbiddenScopes: [
      {
        scope: "im:history",
        why: "Direct messages between two people. README-CEC.md rules out private-message mining and this scope is the mining.",
        readsPrivateMessages: true,
      },
      {
        scope: "mpim:history",
        why: "Group direct messages. Same rule: a conversation that is not in a channel the club connected is not club data.",
        readsPrivateMessages: true,
      },
      {
        scope: "groups:history",
        why: "Private channels, including officer channels the club did not connect and channels with nothing to do with the club.",
        readsPrivateMessages: true,
      },
      {
        scope: "search:read",
        why: "Searches everything the installing user can see, which quietly re-grants every scope above by another route.",
        readsPrivateMessages: true,
      },
      {
        scope: "users:read.email",
        why: "Workspace-wide email harvesting. Matching a Slack account to a roster entry is done by an explicit officer mapping instead, which the member can see.",
      },
    ],
    env: [
      {
        name: "CEC_SLACK_CLIENT_ID",
        required: true,
        secret: false,
        what: "Slack app client ID",
        where: "https://api.slack.com/apps, your app, Basic Information",
      },
      {
        name: "CEC_SLACK_CLIENT_SECRET",
        required: true,
        secret: true,
        what: "Slack app client secret",
        where: "https://api.slack.com/apps, your app, Basic Information",
      },
      {
        name: "CEC_SLACK_SIGNING_SECRET",
        required: true,
        secret: true,
        what: "Verifies that inbound Slack events really came from Slack",
        where: "https://api.slack.com/apps, your app, Basic Information",
      },
    ],
    setup: [
      {
        by: "founder",
        what: "Create a Slack app in the club's workspace, from an app manifest listing exactly the three bot scopes above.",
        where: "https://api.slack.com/apps, Create New App, From an app manifest",
        produces:
          "CEC_SLACK_CLIENT_ID, CEC_SLACK_CLIENT_SECRET, CEC_SLACK_SIGNING_SECRET",
      },
      {
        by: "founder",
        what: "Set the OAuth redirect URL to <CEC_ORIGIN>/api/cec/integrations/slack/callback.",
        where: "Your app, OAuth & Permissions, Redirect URLs",
      },
      {
        by: "club_officers",
        what: "A workspace admin installs the app, then invites the bot to the single channel the club wants connected with /invite @ClubOS. The bot sees nothing until it is invited, and seeing stops when it is removed.",
        where: "Slack",
      },
    ],
    dataFlow: {
      outbound:
        "Announcement text for events, meetings and task deadlines, into the connected channel only.",
      inbound:
        "Messages from the connected channel, plus the channel list used to pick it.",
      neverMoves:
        "DMs, group DMs, private channels, workspace-wide search results, workspace member emails.",
    },
    authorizeUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    revokeUrl: "https://slack.com/api/auth.revoke",
    docs: "https://api.slack.com/authentication/oauth-v2",
  },

  {
    id: "discord",
    name: "Discord",
    category: "chat",
    enables: [
      "Post event announcements and RSVP links to the connected server channel.",
      "Let a member RSVP with a slash command, which is an explicit act, rather than by parsing what they typed in chat.",
    ],
    auth: "oauth2",
    scopes: [
      {
        scope: "bot",
        why: "Installs the club's bot into the server. Nothing can be posted without it.",
      },
      {
        scope: "applications.commands",
        why: "Registers the /rsvp and /events slash commands. A command invocation is a deliberate request by one member, which is why it replaces reading the channel.",
      },
    ],
    forbiddenScopes: [
      {
        scope: "MESSAGE_CONTENT (privileged gateway intent)",
        why: "Discord gates message text behind a privileged intent because it reads everything everyone types. Slash commands deliver the same feature with an explicit invocation, so we do not enable it.",
        readsPrivateMessages: true,
      },
      {
        scope: "email",
        why: "The club has a roster with emails on it. Taking the Discord account email as well duplicates personal data for no new capability.",
      },
    ],
    env: [
      {
        name: "CEC_DISCORD_CLIENT_ID",
        required: true,
        secret: false,
        what: "Application ID",
        where: "https://discord.com/developers/applications, your app, General Information",
      },
      {
        name: "CEC_DISCORD_CLIENT_SECRET",
        required: true,
        secret: true,
        what: "OAuth2 client secret",
        where: "Your app, OAuth2",
      },
      {
        name: "CEC_DISCORD_BOT_TOKEN",
        required: true,
        secret: true,
        what: "Bot token used for posting. Shown exactly once; regenerating it invalidates the old one.",
        where: "Your app, Bot, Reset Token",
      },
      {
        name: "CEC_DISCORD_PUBLIC_KEY",
        required: true,
        secret: false,
        what: "Ed25519 public key used to verify inbound interaction signatures. Discord rejects an endpoint that fails its signature check.",
        where: "Your app, General Information",
      },
    ],
    setup: [
      {
        by: "founder",
        what: "Create a Discord application and add a bot user. Leave every privileged gateway intent switched off.",
        where: "https://discord.com/developers/applications",
        produces:
          "CEC_DISCORD_CLIENT_ID, CEC_DISCORD_CLIENT_SECRET, CEC_DISCORD_BOT_TOKEN, CEC_DISCORD_PUBLIC_KEY",
      },
      {
        by: "founder",
        what: "Set the Interactions Endpoint URL to <CEC_ORIGIN>/api/cec/integrations/discord/interactions. Discord sends a signed PING and refuses to save the URL until it verifies.",
        where: "Your app, General Information",
      },
      {
        by: "club_officers",
        what: "A server admin authorises the bot with permissions Send Messages and Embed Links only, into the club server, and restricts it to one channel with channel permissions.",
        where: "Discord server settings",
      },
    ],
    dataFlow: {
      outbound: "Announcement text and RSVP links into the connected channel.",
      inbound:
        "Slash-command invocations: which member ran which command, with its arguments. No ambient message text.",
      neverMoves:
        "Channel chatter, DMs, member email addresses, server member lists.",
    },
    authorizeUrl: "https://discord.com/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    revokeUrl: "https://discord.com/api/oauth2/token/revoke",
    docs: "https://discord.com/developers/docs/topics/oauth2",
  },

  {
    id: "canvas",
    name: "Canvas LMS",
    category: "lms",
    auth: "oauth2",
    enables: [
      "Read a consenting member's course list and assignment due dates so the academic-weather model uses real prelim weeks instead of a hand-typed calendar.",
      "Warn an officer before scheduling a launch night in the week half the club has two prelims.",
    ],
    scopes: [
      {
        scope: "url:GET|/api/v1/courses",
        why: "Course code and term for the courses the consenting member is enrolled in. This is what turns 'busy season' into a date range the scheduler can use.",
      },
      {
        scope: "url:GET|/api/v1/calendar_events",
        why: "Assignment and exam dates, which are the actual load. Without them the weather model is guessing from the university academic calendar alone.",
      },
    ],
    forbiddenScopes: [
      {
        scope: "url:GET|/api/v1/courses/:course_id/enrollments",
        why: "Returns grades and scores. A club has no business holding a member's academic standing, and holding it would put student education records under FERPA inside a club CRM.",
      },
      {
        scope: "url:GET|/api/v1/users/:user_id/profile",
        why: "Institutional profile data the roster already has, from a system with far stricter obligations attached to it.",
      },
      {
        scope: "https://purl.imsglobal.org/spec/lti-ags/scope/score",
        why: "The LTI Assignment and Grade Services scope: it can write grades. Nothing a club does should be able to touch a gradebook.",
      },
    ],
    env: [
      {
        name: "CEC_CANVAS_BASE_URL",
        required: true,
        secret: false,
        what: "The institution's Canvas host, e.g. https://canvas.cornell.edu. Every endpoint is relative to it, so it is not a constant.",
        where: "The browser address bar when logged into Canvas",
      },
      {
        name: "CEC_CANVAS_CLIENT_ID",
        required: true,
        secret: false,
        what: "Developer key id issued by the Canvas administrator",
        where: "Canvas, Admin, Developer Keys",
      },
      {
        name: "CEC_CANVAS_CLIENT_SECRET",
        required: true,
        secret: true,
        what: "Developer key secret",
        where: "Canvas, Admin, Developer Keys",
      },
    ],
    setup: [
      {
        by: "university",
        what: "A Canvas administrator creates an API developer key scoped to exactly the two endpoints above, with the redirect URI <CEC_ORIGIN>/api/cec/integrations/canvas/callback, and switches it ON.",
        where: "Canvas, Admin, Developer Keys, + Developer Key, API Key",
        produces: "CEC_CANVAS_CLIENT_ID and CEC_CANVAS_CLIENT_SECRET",
        caveat:
          "Only central IT can issue this. A student club cannot self-serve it, and the request normally goes through a data-risk review before anyone presses ON. Expect weeks, not days, and expect to be asked why a club needs LMS data at all.",
      },
      {
        by: "club_officers",
        what: "Each member who wants their academic load counted connects individually and can disconnect at any time. No officer connects Canvas on anyone else's behalf.",
        where: "Club OS, You, Integrations",
      },
    ],
    dataFlow: {
      outbound: "Nothing. Club OS never writes to Canvas.",
      inbound:
        "Course codes, term dates, and assignment due dates for the connecting member only.",
      neverMoves:
        "Grades, submissions, feedback, enrolment status, anything about a member who did not connect.",
    },
    authorizeUrl: "{CEC_CANVAS_BASE_URL}/login/oauth2/auth",
    tokenUrl: "{CEC_CANVAS_BASE_URL}/login/oauth2/token",
    revokeUrl: "{CEC_CANVAS_BASE_URL}/login/oauth2/token",
    docs: "https://canvas.instructure.com/doc/api/file.oauth.html",
  },

  {
    id: "cornell_sso",
    name: "Cornell SSO (Shibboleth / SAML 2.0)",
    category: "identity",
    // Not oauth2: SAML has no token endpoint and no API credential. The browser
    // carries a signed assertion from the university IdP to our SP and that is
    // the entire exchange, so there is nothing for `auth` to name.
    auth: "none",
    protocol: "saml2_shibboleth",
    enables: [
      "Prove someone is a current Cornell student before they can see the member directory, without the club running its own password reset.",
      "Bind a Club OS account to a NetID, which survives a student changing their email and dies when they leave the university.",
    ],
    scopes: [
      {
        scope: "eduPersonPrincipalName",
        why: "The NetID-scoped identifier. It is the stable key that a personal email address is not: it cannot be re-registered by someone else after graduation.",
      },
      {
        scope: "mail",
        why: "The university address, used to match an existing roster entry so SSO does not create a duplicate person.",
      },
      {
        scope: "displayName",
        why: "So the officer view shows a name. Without it the directory lists NetIDs.",
      },
    ],
    forbiddenScopes: [
      {
        scope: "eduPersonEntitlement and any departmental attribute",
        why: "College, department, class year and entitlements are university records. A club that wants a class year should ask the member, who can then see and correct it.",
      },
      {
        scope: "any home address or phone attribute",
        why: "Directory contact data has its own release rules and the club has no workflow that needs it.",
      },
    ],
    env: [
      {
        name: "CEC_SAML_IDP_METADATA_URL",
        required: true,
        secret: false,
        what: "The university IdP metadata URL, which carries the signing certificate",
        where: "Cornell IT identity management documentation",
      },
      {
        name: "CEC_SAML_SP_ENTITY_ID",
        required: true,
        secret: false,
        what: "Our service provider entity id, registered with the IdP",
        where: "Chosen by us, then registered with Cornell IT",
      },
      {
        name: "CEC_SAML_SP_PRIVATE_KEY",
        required: true,
        secret: true,
        what: "SP private key used to sign authentication requests and decrypt assertions",
        where: "Generated locally; only the certificate is handed to the IdP",
      },
    ],
    setup: [
      {
        by: "founder",
        what: "Generate an SP key pair and publish SP metadata at <CEC_ORIGIN>/api/cec/integrations/saml/metadata with ACS URL <CEC_ORIGIN>/api/cec/integrations/saml/acs.",
        where: "The server",
        produces: "CEC_SAML_SP_ENTITY_ID and CEC_SAML_SP_PRIVATE_KEY",
      },
      {
        by: "university",
        what: "Cornell IT registers the SP in InCommon or the campus federation and signs off an attribute-release agreement for exactly the three attributes above.",
        where: "Cornell IT identity management, by ticket",
        caveat:
          "This is a university agreement, not a console setting. It typically requires a named institutional sponsor, a security and data review, and a real privacy policy at a club-owned domain. A student organisation with no legal entity is frequently refused outright. Budget a term and have a fallback.",
      },
    ],
    dataFlow: {
      outbound:
        "An authentication request naming our SP. No member data leaves Club OS.",
      inbound:
        "A signed assertion per sign-in carrying NetID, university email and display name.",
      neverMoves:
        "Enrolment, grades, college, advisor, class year, any directory attribute outside the three released ones.",
    },
    docs: "https://shibboleth.atlassian.net/wiki/spaces/SP3/overview",
  },

  {
    id: "postmark",
    name: "Postmark (transactional email)",
    category: "email",
    auth: "api_key",
    exclusiveGroup: "email_delivery",
    enables: [
      "Send the account-verification and password-reset mail that README-CEC.md lists as required before broad use.",
      "Deliver an RSVP confirmation and an event reminder from a club address, so a 100-applicant funnel stops running out of a student's personal Gmail.",
    ],
    scopes: [
      {
        scope: "server:send (Server API token)",
        why: "A Server token can send from one configured server and nothing else. The Account token, which can create servers and read every message, is never placed on our host.",
      },
    ],
    forbiddenScopes: [
      {
        scope: "account token",
        why: "Grants server creation, domain changes and message-body access across the whole account. The send path does not need any of it.",
      },
      {
        scope: "inbound message stream",
        why: "Nothing in Club OS reads replies. Enabling inbound would create a mailbox of member correspondence with no workflow to justify it.",
      },
    ],
    env: [
      {
        name: "CEC_POSTMARK_SERVER_TOKEN",
        required: true,
        secret: true,
        what: "Server API token used on every send",
        where: "Postmark, your server, API Tokens",
      },
      {
        name: "CEC_MAIL_FROM",
        required: true,
        secret: false,
        what: "The From address, at a domain the club verifiably owns",
        where: "Chosen by the club; must match the verified sender signature",
      },
      {
        name: "CEC_MAIL_REPLY_TO",
        required: false,
        secret: false,
        what: "Where replies go if that is not the From address",
        where: "Chosen by the club",
      },
    ],
    setup: [
      {
        by: "founder",
        what: "Create a Postmark account and a server named for the club.",
        where: "https://postmarkapp.com",
        produces: "CEC_POSTMARK_SERVER_TOKEN",
      },
      {
        by: "club_officers",
        what: "Verify a sender domain by adding the DKIM TXT record and the Return-Path CNAME to DNS, then add an SPF record and a DMARC policy.",
        where: "The club domain's DNS control panel",
        caveat:
          "This is blocked until cornellec.com is transferred off the graduated president's personal registrar account (docs/12 §11). Nobody currently in the club can add a DNS record, so email delivery cannot be finished no matter what code exists.",
      },
      {
        by: "founder",
        what: "Request removal of the account's sending limits before the first recruitment blast; new accounts are rate limited and a 100-recipient send from a cold domain lands in spam regardless.",
        where: "Postmark support",
      },
    ],
    dataFlow: {
      outbound:
        "One recipient address, subject and body per transactional message, plus a message id we keep for delivery status.",
      inbound: "Delivery, bounce and spam-complaint events for those messages.",
      neverMoves:
        "The roster in bulk, recruitment reviews, private notes, anything not in the message being sent.",
    },
    docs: "https://postmarkapp.com/developer/api/overview",
  },

  {
    id: "resend",
    name: "Resend (transactional email)",
    category: "email",
    auth: "api_key",
    exclusiveGroup: "email_delivery",
    enables: [
      "Same sending workflows as Postmark, for a club that prefers Resend's free tier.",
    ],
    scopes: [
      {
        scope: "sending_access (API key with Sending access)",
        why: "Resend keys are issued as Full access or Sending access. Sending access can deliver mail and cannot change domains or read the account, which is exactly the privilege the send path needs.",
      },
    ],
    forbiddenScopes: [
      {
        scope: "full_access",
        why: "Lets a leaked key add a sending domain and send as the club from anywhere. Sending access cannot.",
      },
    ],
    env: [
      {
        name: "CEC_RESEND_API_KEY",
        required: true,
        secret: true,
        what: "API key with Sending access only",
        where: "Resend dashboard, API Keys",
      },
      {
        name: "CEC_MAIL_FROM",
        required: true,
        secret: false,
        what: "From address at a verified club domain",
        where: "Chosen by the club",
      },
    ],
    setup: [
      {
        by: "founder",
        what: "Create a Resend account and an API key with Sending access, not Full access.",
        where: "https://resend.com",
        produces: "CEC_RESEND_API_KEY",
      },
      {
        by: "club_officers",
        what: "Add the club domain and publish the DKIM and SPF records it gives you.",
        where: "The club domain's DNS control panel",
        caveat: "Same DNS blocker as Postmark: the club does not control its domain yet.",
      },
    ],
    dataFlow: {
      outbound: "Recipient, subject and body per transactional message.",
      inbound: "Delivery and bounce webhooks.",
      neverMoves: "The roster in bulk; anything not in the message being sent.",
    },
    docs: "https://resend.com/docs/api-reference/introduction",
  },

  {
    id: "ses",
    name: "Amazon SES (transactional email)",
    category: "email",
    auth: "api_key",
    exclusiveGroup: "email_delivery",
    enables: [
      "Same sending workflows, at the lowest per-message cost, for a club already inside an AWS account.",
    ],
    scopes: [
      {
        scope: "ses:SendEmail",
        why: "The single IAM action the sender calls. An IAM policy granting only this, conditioned on ses:FromAddress, cannot send as any other identity.",
      },
    ],
    forbiddenScopes: [
      {
        scope: "ses:* or AmazonSESFullAccess",
        why: "Includes identity deletion and configuration changes. A key on a web host should not be able to delete the club's verified domain.",
      },
      {
        scope: "any non-SES AWS permission",
        why: "An over-broad key on the web host turns one web vulnerability into an AWS account compromise.",
      },
    ],
    env: [
      {
        name: "CEC_SES_REGION",
        required: true,
        secret: false,
        what: "SES region, e.g. us-east-1. Identities are per-region, so the wrong region fails as 'not verified'.",
        where: "AWS console",
      },
      {
        name: "CEC_SES_ACCESS_KEY_ID",
        required: true,
        secret: false,
        what: "IAM access key id for the send-only user",
        where: "AWS IAM",
      },
      {
        name: "CEC_SES_SECRET_ACCESS_KEY",
        required: true,
        secret: true,
        what: "IAM secret access key",
        where: "AWS IAM, shown once at creation",
      },
      {
        name: "CEC_MAIL_FROM",
        required: true,
        secret: false,
        what: "From address at a verified identity",
        where: "Chosen by the club",
      },
    ],
    setup: [
      {
        by: "founder",
        what: "Create an IAM user with an inline policy allowing only ses:SendEmail, with a Condition on ses:FromAddress matching CEC_MAIL_FROM.",
        where: "AWS IAM",
        produces: "CEC_SES_ACCESS_KEY_ID and CEC_SES_SECRET_ACCESS_KEY",
      },
      {
        by: "club_officers",
        what: "Verify the domain identity by publishing the three DKIM CNAMEs SES generates.",
        where: "The club domain's DNS control panel",
        caveat: "Same DNS blocker as Postmark.",
      },
      {
        by: "founder",
        what: "Request production access. A new SES account is in the sandbox and can only send to addresses you have separately verified, which means a recruitment mail-out silently reaches nobody.",
        where: "AWS console, SES, Account dashboard, Request production access",
        caveat: "AWS reviews the request by hand; approval takes about a day and can be refused.",
      },
    ],
    dataFlow: {
      outbound: "Recipient, subject and body per transactional message.",
      inbound: "Bounce and complaint notifications, if an SNS topic is configured.",
      neverMoves: "The roster in bulk; anything not in the message being sent.",
    },
    docs: "https://docs.aws.amazon.com/ses/latest/dg/send-email.html",
  },

  {
    id: "stripe",
    name: "Stripe (dues and ticketing)",
    category: "payments",
    auth: "api_key",
    webhooks: [
      {
        event: "checkout.session.completed",
        why: "The only reliable signal that money actually arrived. Marking dues paid on the browser redirect instead would record a payment for anyone who can open the success URL.",
      },
      {
        event: "charge.refunded",
        why: "Reverses the register entry when a refund is issued, so the money screen cannot drift from the bank.",
      },
    ],
    enables: [
      "Collect dues or a ticket price through a Stripe-hosted checkout page, with the result written to the existing money register.",
      "Reconcile who has paid against the roster without a treasurer maintaining a spreadsheet of Venmo screenshots.",
    ],
    scopes: [
      {
        scope: "restricted key: Checkout Sessions write",
        why: "Creating the hosted checkout session is the only write the payment flow performs.",
      },
      {
        scope: "restricted key: PaymentIntents read",
        why: "Confirms an amount and status when a webhook arrives, so the register records what Stripe says happened rather than what the browser claimed.",
      },
    ],
    forbiddenScopes: [
      {
        scope: "unrestricted secret key (sk_live)",
        why: "Can issue refunds, move balances, change payout bank details and read every customer record. A student-run web host is not where that key belongs.",
      },
      {
        scope: "Customers read/write",
        why: "Pulls partial card data, billing addresses and payment history into the club database. Stripe-hosted checkout means Club OS never needs to see a card at all, which keeps the club in the simplest PCI bracket.",
      },
    ],
    env: [
      {
        name: "CEC_STRIPE_SECRET_KEY",
        required: true,
        secret: true,
        what: "Restricted key with the two permissions above",
        where: "Stripe dashboard, Developers, API keys, Create restricted key",
      },
      {
        name: "CEC_STRIPE_WEBHOOK_SECRET",
        required: true,
        secret: true,
        what: "Signing secret used to verify inbound events. Without it any caller can post a fake 'payment succeeded'.",
        where: "Stripe dashboard, Developers, Webhooks, your endpoint",
      },
    ],
    setup: [
      {
        by: "founder",
        what: "Open a Stripe account for the club, with the legal entity, EIN or SSN, and the bank account money will land in.",
        where: "https://dashboard.stripe.com/register",
        caveat:
          "This is the hardest human step in this file. A student organisation usually has no legal entity or bank account of its own, so the account must belong to the university's student-org financial structure. Opening it in a student's own name makes that student personally liable for the club's money and repeats the cornellec.com failure with cash instead of a domain. Do not do it to unblock a demo.",
      },
      {
        by: "founder",
        what: "Create a restricted API key with exactly Checkout Sessions write and PaymentIntents read.",
        where: "Developers, API keys",
        produces: "CEC_STRIPE_SECRET_KEY",
      },
      {
        by: "founder",
        what: "Add a webhook endpoint at <CEC_ORIGIN>/api/cec/integrations/stripe/webhook subscribed to the two events above.",
        where: "Developers, Webhooks",
        produces: "CEC_STRIPE_WEBHOOK_SECRET",
      },
    ],
    dataFlow: {
      outbound:
        "An amount, a currency, a description and an internal reference id per checkout session. No roster, no names beyond what the payer types on Stripe's own page.",
      inbound:
        "Payment succeeded and refunded events: amount, status, and our reference id.",
      neverMoves:
        "Card numbers, which never touch this server at all; member records; anything about members who have not paid.",
    },
    docs: "https://docs.stripe.com/payments/checkout",
  },

  {
    id: "groupme",
    name: "GroupMe",
    category: "chat",
    // A bot posts with a bot id, not an OAuth token, and inbound arrives at a
    // callback the club configures per group. Both halves are deliberately
    // group-scoped; see the forbidden list for what we refuse to hold.
    auth: "api_key",
    webhooks: [
      {
        event: "group message callback",
        why: "GroupMe posts each message of ONE group to a URL the club registers for that group. That is the narrowest inbound path the platform offers and it cannot reach any other conversation.",
      },
    ],
    enables: [
      "Post event announcements and RSVP links into the group chat most Cornell clubs actually live in.",
      "Let a member reply with an RSVP keyword in the club group, which is where they already are.",
    ],
    scopes: [
      {
        scope: "bot post (bot id, one group)",
        why: "A GroupMe bot id can post to the single group it was created in and can do nothing else. It cannot read, cannot list groups, and cannot be replayed against another chat.",
      },
    ],
    forbiddenScopes: [
      {
        scope: "GroupMe user access token",
        why: "A GroupMe user token is all-or-nothing: it reads every group AND every direct message of the person who issued it. Club OS never stores one. A human uses it once, in their own browser at dev.groupme.com, to create the bot, and the bot id is the only thing that reaches this server.",
        readsPrivateMessages: true,
      },
    ],
    env: [
      {
        name: "CEC_GROUPME_BOT_ID",
        required: true,
        secret: true,
        what: "Bot id for the club group. It is a posting capability, so it is treated as a secret even though GroupMe calls it an id.",
        where: "https://dev.groupme.com/bots, after creating the bot",
      },
      {
        name: "CEC_GROUPME_CALLBACK_SECRET",
        required: true,
        secret: true,
        what: "A random string we require in the callback URL. GroupMe does not sign its callbacks, so an unguessable path is the only thing standing between the club group and anyone who can POST.",
        where: "Generated by the club: openssl rand -hex 32",
      },
    ],
    setup: [
      {
        by: "club_officers",
        what: "An officer who is in the club group signs in at dev.groupme.com and creates a bot attached to that group, with callback URL <CEC_ORIGIN>/api/cec/integrations/groupme/<CEC_GROUPME_CALLBACK_SECRET>.",
        where: "https://dev.groupme.com/bots/new",
        produces: "CEC_GROUPME_BOT_ID",
        caveat:
          "The officer's GroupMe session grants access to all of their chats. It stays in their browser. Do not paste a GroupMe access token into Club OS, a config file, or the group chat — the shared-password incident in docs/12 §8 is the same mistake.",
      },
      {
        by: "founder",
        what: "Set both variables in the server environment and rotate the callback secret whenever an officer with access leaves.",
        where: "web/.env.local or the deployment secret store",
      },
    ],
    dataFlow: {
      outbound: "Announcement text into the one group the bot belongs to.",
      inbound:
        "Messages from that one group, delivered by GroupMe to the callback URL.",
      neverMoves:
        "Any other group, any direct message, the member's GroupMe account, the officer's token.",
    },
    docs: "https://dev.groupme.com/docs/v3",
  },

  {
    id: "google_drive",
    name: "Google Drive (club files)",
    category: "storage",
    auth: "oauth2",
    enables: [
      "Attach a real file to a project or meeting record instead of a link to a Drive folder nobody outside the officer team can open.",
      "Keep uploaded artefacts in a club-owned Drive so they survive the officer who uploaded them, which a personal Drive does not.",
    ],
    scopes: [
      {
        scope: "https://www.googleapis.com/auth/drive.file",
        why: "Grants access only to files this application itself created or that a user explicitly picked. Everything else in the Drive stays invisible to us, which is the entire point of choosing this scope.",
      },
    ],
    forbiddenScopes: [
      {
        scope: "https://www.googleapis.com/auth/drive",
        why: "Full read/write over every file in the account, including a student's coursework and finances. drive.file does the job.",
      },
      {
        scope: "https://www.googleapis.com/auth/drive.readonly",
        why: "Reads every file in the account. A club file picker does not need to enumerate somebody's Drive.",
      },
    ],
    env: [
      {
        name: "CEC_GOOGLE_CLIENT_ID",
        required: true,
        secret: false,
        what: "Shared with the other Google integrations",
        where: "Google Cloud console, Credentials",
      },
      {
        name: "CEC_GOOGLE_CLIENT_SECRET",
        required: true,
        secret: true,
        what: "Shared with the other Google integrations",
        where: "Google Cloud console, Credentials",
      },
      {
        name: "CEC_GOOGLE_DRIVE_FOLDER_ID",
        required: true,
        secret: false,
        what: "The club folder everything is written into, so uploads cannot scatter across a personal Drive",
        where: "The folder URL in Google Drive",
      },
    ],
    setup: [
      {
        by: "founder",
        what: "Enable the Google Drive API in the same Cloud project and add the drive.file scope to the consent screen.",
        where: "APIs & Services, Library",
      },
      {
        by: "club_officers",
        what: "Create a club-owned Drive folder, give the officer role access, and register it in the asset register so ownership moves at handoff.",
        where: "Google Drive",
        produces: "CEC_GOOGLE_DRIVE_FOLDER_ID",
      },
    ],
    dataFlow: {
      outbound: "Files an officer deliberately uploads, into the named club folder.",
      inbound: "File ids and links for what we uploaded.",
      neverMoves:
        "Any file the application did not create; the rest of the account's Drive is not visible to us by construction.",
    },
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    revokeUrl: "https://oauth2.googleapis.com/revoke",
    authorizeParams: { access_type: "offline", prompt: "consent" },
    docs: "https://developers.google.com/drive/api/guides/api-specific-auth",
  },
];

// --- lookups ----------------------------------------------------------------

export function integrationIds(): string[] {
  return INTEGRATIONS.map((i) => i.id);
}

export function findIntegration(id: string): Integration | undefined {
  return INTEGRATIONS.find((i) => i.id === id);
}

/** Variables that must be present before this integration can be attempted. */
export function requiredEnv(i: Integration): string[] {
  return i.env.filter((e) => e.required).map((e) => e.name);
}

/**
 * True when a successful authorisation leaves something behind that must be
 * kept. Identity providers deliberately do not: see oauth.ts for why a login
 * token is read once and dropped.
 */
export function persistsToken(i: Integration): boolean {
  return i.auth === "oauth2" && i.category !== "identity";
}

/** The scope strings as they go on the wire. */
export function scopeStrings(i: Integration): string[] {
  return i.scopes.map((s) => s.scope);
}

// --- invariants -------------------------------------------------------------

/**
 * The registry's own checks, returned rather than thrown so a test can print
 * every problem at once instead of the first one.
 *
 * These are not style rules. A scope with no justification is how scope creep
 * enters a codebase, and a requested scope that reads private messages is a
 * product promise broken in a diff nobody read.
 */
export function registryProblems(): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const i of INTEGRATIONS) {
    const at = `${i.id}:`;
    if (seen.has(i.id)) problems.push(`${at} duplicate id`);
    seen.add(i.id);
    if (!INTEGRATION_CATEGORIES.includes(i.category))
      problems.push(`${at} unknown category ${i.category}`);
    if (!AUTH_MECHANISMS.includes(i.auth))
      problems.push(`${at} unknown auth mechanism ${i.auth}`);
    if (!i.enables.length) problems.push(`${at} claims no workflow`);
    if (!i.setup.length)
      problems.push(`${at} has no human setup steps, so the UI has nothing to show`);
    if (!i.env.length) problems.push(`${at} declares no environment variables`);
    if (!requiredEnv(i).length)
      problems.push(`${at} has no required env var, so it can never read as not_configured`);
    if (!i.dataFlow.outbound || !i.dataFlow.inbound || !i.dataFlow.neverMoves)
      problems.push(`${at} has an incomplete dataFlow statement`);
    if (!i.docs.startsWith("https://")) problems.push(`${at} docs link is not https`);

    const scopes = new Set<string>();
    for (const s of i.scopes) {
      if (scopes.has(s.scope)) problems.push(`${at} duplicate scope ${s.scope}`);
      scopes.add(s.scope);
      // 40 characters is not a magic number: it is longer than any restatement
      // of a scope name, so it forces a sentence about the workflow.
      if (!s.why || s.why.trim().length < 40)
        problems.push(`${at} scope ${s.scope} has no real justification`);
      if (s.readsPrivateMessages)
        problems.push(
          `${at} REQUESTS a private-message scope (${s.scope}). README-CEC.md and docs/11 forbid this.`,
        );
    }
    for (const f of i.forbiddenScopes || []) {
      if (scopes.has(f.scope))
        problems.push(`${at} ${f.scope} is both requested and forbidden`);
      if (!f.why || f.why.trim().length < 40)
        problems.push(`${at} forbidden scope ${f.scope} does not say why`);
    }
    for (const e of i.env) {
      if (!/^CEC_[A-Z0-9_]+$/.test(e.name))
        problems.push(`${at} env var ${e.name} is not namespaced CEC_*`);
      if (!e.what || !e.where) problems.push(`${at} env var ${e.name} is undocumented`);
    }
    for (const s of i.setup) {
      if (!s.what || !s.where) problems.push(`${at} a setup step is unactionable`);
    }
    if (i.auth === "oauth2") {
      if (!i.authorizeUrl || !i.tokenUrl)
        problems.push(`${at} oauth2 without an authorize or token endpoint`);
      if (!i.scopes.length) problems.push(`${at} oauth2 with no scopes`);
      if (!i.env.some((e) => /CLIENT_ID$/.test(e.name)))
        problems.push(`${at} oauth2 without a client id variable`);
      if (!i.env.some((e) => /CLIENT_SECRET$/.test(e.name)))
        problems.push(`${at} oauth2 without a client secret variable`);
    }
    if (i.auth === "api_key" && !i.env.some((e) => e.secret && e.required))
      problems.push(`${at} api_key auth with no required secret`);
  }
  return problems;
}
