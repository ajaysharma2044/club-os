import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "club-portal-"));
process.env.CEC_DATABASE = join(dir, "test.sqlite");
process.env.CEC_EMAIL_MODE = "disabled";
process.env.CEC_ALLOW_EPHEMERAL = "1";
const { db, password, item } = await import("../lib/cec/db.ts");
const {
  portalAction: act,
  portalState: read,
  portalInit,
} = await import("../lib/cec/portal.ts");
const { mutate } = await import("../lib/cec/service.ts");
const o = {
    id: "portal-officer",
    name: "Officer",
    email: "o@portal.example.test",
    role: "officer",
  },
  m = {
    id: "portal-member",
    name: "Member",
    email: "m@portal.example.test",
    role: "member",
  },
  n = {
    id: "portal-peer",
    name: "Peer",
    email: "n@portal.example.test",
    role: "member",
  },
  a = {
    id: "portal-applicant",
    name: "Applicant",
    email: "a@portal.example.test",
    role: "applicant",
  };
try {
  for (const u of [o, m, n, a])
    await db()
      .prepare(
        "INSERT INTO users(id,name,email,password,role) VALUES(?,?,?,?,?)",
      )
      .run(u.id, u.name, u.email, password("Synthetic-only-password"), u.role);
  await portalInit();
  const profile = {
    version: 0,
    major: "Engineering",
    skills: "Design, TypeScript",
    visibility: "private",
  };
  await act(m, "profile", profile);
  assert.equal((await read(n)).people.find((p) => p.id === m.id).profile, null);
  assert.equal((await read(o)).people.find((p) => p.id === m.id).profile, null);
  await assert.rejects(() => act(m, "profile", profile), /changed/);
  await act(m, "profile", { ...profile, version: 1, visibility: "club" });
  assert.equal(
    (await read(n)).people.find((p) => p.id === m.id).profile.skills,
    profile.skills,
  );
  assert.equal((await read(null)).people.length, 0);
  assert.equal((await read(a)).people.length, 0);
  await assert.rejects(
    () =>
      act(m, "profile", {
        ...profile,
        version: 2,
        photo_url: "javascript:alert(1)",
      }),
    /link|http/i,
  );
  const content = {
    version: 0,
    kind: "Resource",
    title: "Club resource",
    body: "Sample",
    visibility: "club",
    status: "published",
  };
  const c = await act(o, "content/save", content);
  await assert.rejects(() => act(m, "content/save", content), /officer/i);
  assert.equal((await read(null)).content.length, 0);
  assert.equal((await read(m)).content.length, 1);
  await act(o, "content/save", {
    ...content,
    id: c.id,
    version: 1,
    visibility: "public",
  });
  assert.equal((await read(null)).content.length, 1);
  await act(o, "content/save", {
    ...content,
    id: c.id,
    version: 2,
    visibility: "public",
    status: "archived",
  });
  assert.equal((await read(null)).content.length, 0);
  const request = {
    request_key: "once",
    type: "Reimbursement",
    title: "Supplies",
    description: "Receipt details",
    amount: 12.5,
  };
  const r = await act(m, "request/create", request);
  assert.equal((await act(m, "request/create", request)).id, r.id);
  await assert.rejects(
    () => act(m, "request/create", { ...request, title: "Different" }),
    /different/,
  );
  await assert.rejects(() => act(a, "request/create", request), /member/i);
  assert.equal((await read(n)).requests.length, 0);
  assert.equal((await read(m)).requests.length, 1);
  await assert.rejects(
    () =>
      act(n, "request/update", {
        id: r.id,
        version: 1,
        status: "approved",
        note: "No",
      }),
    /officer/i,
  );
  await assert.rejects(
    () =>
      act(m, "request/update", {
        id: r.id,
        version: 1,
        status: "approved",
        note: "No",
      }),
    /officer/i,
  );
  await act(o, "request/update", {
    id: r.id,
    version: 1,
    status: "needs_info",
    note: "Please explain the receipt.",
  });
  await assert.rejects(
    () =>
      act(m, "request/update", {
        id: r.id,
        version: 1,
        status: "submitted",
        note: "Stale",
      }),
    /changed/,
  );
  await act(m, "request/update", {
    id: r.id,
    version: 2,
    status: "submitted",
    note: "It was for the event.",
  });
  await act(o, "request/update", {
    id: r.id,
    version: 3,
    status: "approved",
    note: "Approved for processing.",
  });
  assert.equal((await read(m)).requests[0].history.length, 4);
  await assert.rejects(
    () =>
      act(o, "request/update", {
        id: r.id,
        version: 4,
        status: "declined",
        note: "Changed mind",
      }),
    /closed/,
  );
  const self = await act(o, "request/create", {
    ...request,
    request_key: "self",
  });
  await assert.rejects(
    () =>
      act(o, "request/update", {
        id: self.id,
        version: 1,
        status: "approved",
        note: "Self",
      }),
    /Another officer/,
  );
  const contact = await mutate(o, "create", {
    kind: "contact",
    data: {
      title: "Demo alumni",
      organization: "Demo",
      relationship: "Alumni",
    },
  });
  const f = await act(o, "followup/save", {
    version: 0,
    contact_id: contact.id,
    owner: o.id,
    title: "Ask about panel",
    note: "Manually recorded conversation.",
    status: "open",
  });
  assert.equal((await read(m)).followups.length, 0);
  assert.equal((await read(m)).contacts.length, 0);
  await act(o, "followup/save", {
    id: f.id,
    version: 1,
    contact_id: contact.id,
    owner: o.id,
    title: "Ask about panel",
    note: "Panel confirmed.",
    status: "done",
  });
  assert.equal((await read(o)).followups[0].data.history.length, 2);
  await assert.rejects(
    () =>
      act(m, "followup/save", {
        version: 0,
        person_id: n.id,
        owner: o.id,
        title: "No",
        note: "No",
        status: "open",
      }),
    /officer/i,
  );
  await assert.rejects(
    () => act(o, "profile", { ...profile, organization_id: "other" }),
    /CEC/,
  );
  console.log(
    "Portal PASS: visibility, roles, stale versions, idempotency, request history, self-review boundary and private CRM.",
  );
} finally {
  db().close();
  rmSync(dir, { recursive: true, force: true });
}
