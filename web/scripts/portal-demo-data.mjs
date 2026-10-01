import {
  db,
  tx,
  id,
  timestamp,
  audit,
  entity,
  createItem,
  publishRecord,
} from "../lib/cec/db.ts";
import { portalInit, portalAction } from "../lib/cec/portal.ts";
import { captureItem } from "../lib/cec/evidence.ts";
export const portalBatch = "club-portal-demo-v1";
export async function seedPortal() {
  await portalInit();
  return tx(async () => {
    const prior = await db()
      .prepare(
        "SELECT details FROM audit WHERE action='demo.seeded' AND object_id=?",
      )
      .get(portalBatch);
    if (prior) return { ...JSON.parse(prior.details), replayed: true };
    const base = await db()
      .prepare(
        "SELECT details FROM audit WHERE action='demo.seeded' AND object_id='demo-september-2026-v1'",
      )
      .get();
    if (!base) throw Error("Seed the base demo batch first.");
    const authorized = JSON.parse(base.details).accounts;
    const demos = await db()
      .prepare(
        "SELECT id,name,email,role,interests,shared FROM users WHERE email IN ('tester@demo.club-os.example.test','maya@demo.club-os.example.test','leo@demo.club-os.example.test')",
      )
      .all();
    if (demos.length !== 3 || demos.some((u) => !authorized.includes(u.id)))
      throw Error("Original demo identities do not match.");
    const tester = demos.find((u) => u.email.startsWith("tester@")),
      now = timestamp();
    const manifest = {
      batch: portalBatch,
      content: [],
      items: [],
      requests: [],
      followups: [],
      profiles: [],
      skippedProfiles: [],
    };
    for (const u of demos) {
      if (
        await db()
          .prepare(
            "SELECT 1 FROM portal_profiles WHERE user_id=? AND organization_id='cornell-ec'",
          )
          .get(u.id)
      ) {
        manifest.skippedProfiles.push(u.id);
        continue;
      }
      await portalAction(u, "profile", {
        version: 0,
        bio: "Synthetic club profile for testing. Not a real member.",
        major: u === tester ? "Computer Science" : "Engineering",
        graduation_year: "2027",
        skills:
          u === tester
            ? "Web development, event planning"
            : "Design, public speaking",
        committee: u === tester ? "Technology" : "Events",
        visibility: "club",
      });
      manifest.profiles.push(u.id);
    }
    for (const [kind, title, body, visibility] of [
      [
        "About",
        "Welcome to the club",
        "Sample introduction: a student club for building projects, meeting collaborators and hosting practical workshops. This is demo copy for editing, not an official club statement.",
        "public",
      ],
      [
        "Leadership",
        "Who to contact",
        "Demo guide: contact the events team for event questions, the treasurer for reimbursements, and the membership team for application questions. Replace with actual officers and approved contact details.",
        "public",
      ],
      [
        "Recruitment",
        "How to join",
        "Sample recruitment information. Browse club events and use the membership application in People. No real deadline is announced by this demo.",
        "public",
      ],
      [
        "FAQ",
        "Can I attend before joining?",
        "Example FAQ: some published events are open to prospective members. Check each event description. Replace this answer with the club’s actual policy.",
        "public",
      ],
      [
        "Announcement",
        "Try the new member tools",
        "Demo announcement: update your club profile, browse resources, and submit a sample equipment or event request.",
        "club",
      ],
      [
        "Resource",
        "Event planning checklist",
        "Sample checklist: define the goal, confirm a venue, prepare an agenda, assign tasks, and record attendance. Linked resources retain their original permissions.",
        "club",
      ],
      [
        "Resource",
        "Reimbursement guide",
        "Sample guide: include the amount, reason and a receipt link. Approval is not a payment. Do not submit bank details.",
        "club",
      ],
    ]) {
      const key = id();
      await db()
        .prepare(
          "INSERT INTO portal_content(id,owner,data,created_at,updated_at) VALUES(?,?,?,?,?)",
        )
        .run(
          key,
          tester.id,
          JSON.stringify({
            kind,
            title: "[Demo] " + title,
            body,
            visibility,
            status: "published",
            url: "",
          }),
          now,
          now,
        );
      manifest.content.push(key);
    }
    async function create(kind, input) {
      const data = await entity(tester, kind, input);
      const r = await createItem(tester, kind, data);
      const source = await audit(tester, kind + ".create", r.id, {
        batch: portalBatch,
        version: 1,
      });
      await captureItem(tester, r, source);
      await publishRecord(tester, r);
      manifest.items.push(r.id);
      return r;
    }
    const contacts = [];
    for (const [relationship, name, organization] of [
      ["Alumni", "Alex Rivera", "Demo Alumni Network"],
      ["Sponsor", "Jordan Chen", "Demo Workshop Partner"],
      ["Mentor", "Sam Patel", "Demo Product Studio"],
      ["Employer", "Taylor Morgan", "Demo Careers Team"],
      ["Vendor", "Casey Lee", "Demo Event Supplies"],
    ])
      contacts.push(
        await create("contact", {
          title: "[Demo] " + name,
          organization,
          email: "sample@demo.example.test",
          relationship,
          notes:
            "Synthetic contact. No outreach has been made; the email is a non-deliverable example.",
        }),
      );
    await create("deal", {
      title: "[Demo] Workshop support discussion",
      contact_id: contacts[1].id,
      stage: "lead",
      amount: "500",
      next_step: "Sample sponsor discussion; no commitment or money received.",
    });
    for (const type of [
      "Reimbursement",
      "Attendance correction",
      "Equipment",
      "Event proposal",
      "Other",
    ]) {
      const r = await portalAction(tester, "request/create", {
        request_key: portalBatch + ":" + type,
        type,
        title:
          "[Demo] " +
          {
            Reimbursement: "Workshop supplies",
            "Attendance correction": "Review sample event attendance",
            Equipment: "Borrow a projector",
            "Event proposal": "Host a project showcase",
            Other: "Update a resource link",
          }[type],
        description:
          "Synthetic request for testing. No payment, reservation or real attendance change is requested.",
        amount: type === "Reimbursement" ? 24.5 : undefined,
        url: "",
      });
      manifest.requests.push(r.id);
    }
    // Historical example: a responsible person can now be a member after leaving office.
    const key = id(),
      history = [
        {
          actor: tester.id,
          at: now,
          status: "done",
          note: "Synthetic historical follow-up; no person was contacted.",
          owner: tester.id,
          due_at: "",
        },
      ];
    await db()
      .prepare(
        "INSERT INTO portal_followups(id,owner,contact_id,data,created_at,updated_at) VALUES(?,?,?,?,?,?)",
      )
      .run(
        key,
        tester.id,
        contacts[0].id,
        JSON.stringify({
          title: "[Demo] Alumni panel follow-up",
          note: history[0].note,
          status: "done",
          due_at: "",
          history,
        }),
        now,
        now,
      );
    manifest.followups.push(key);
    await audit(tester, "demo.seeded", portalBatch, manifest);
    return manifest;
  });
}
