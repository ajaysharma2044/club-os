import {portalState,portalAction} from '@/lib/cec/portal';
import { databaseRequest } from "@/lib/cec/postgres/runtime";
import { asyncFilter } from "../../../../lib/cec/async";
import { toolsState, toolsAction, clubCalendar } from '@/lib/cec/officer-tools';
import { emailState, emailAction, requestReset, consumeEmailToken } from '@/lib/cec/email';
import { recordServerError } from "@/lib/cec/operations";
import { membershipState, changeMembership } from "@/lib/cec/memberships";
import { NextRequest, NextResponse } from "next/server";
import {
  db,
  user,
  fail,
  officer,
  items,
  item,
  throttle,
  hash,
} from "@/lib/cec/db";
import { auth, state, mutate } from "@/lib/cec/service";
import { schedule, scheduleState, calendarFeed } from "@/lib/cec/scheduling";
import { adaptive, adaptiveRead } from "@/lib/cec/adaptive";
import { evidenceRead, evidenceAction } from "@/lib/cec/evidence";
import { recommendations } from "@/lib/cec/recommendations";
import {
  interviews,
  interviewState,
  interviewsInit,
} from "@/lib/cec/interviews";
import { opportunities, opportunityState } from "@/lib/cec/opportunities";
import { outcomes } from "@/lib/cec/outcomes";
import { behavior, behaviorState, registryLatest } from "@/lib/cec/signals";
import { invites, inviteState, inviteInfo, claim } from "@/lib/cec/invites";
import { assets, assetState } from "@/lib/cec/assets";
import { checkin, attendanceState } from "@/lib/cec/checkin";
import { factorState } from "@/lib/cec/factor-store";
import { planning, planningReadiness } from "@/lib/cec/planning/service";
import { messaging, messagingState } from "@/lib/cec/messaging/service";
import { integrations } from "@/lib/cec/integrations/status";
import { upNext } from "@/lib/cec/upnext";
import { inboxSummary } from "@/lib/cec/messaging/delivery";
import { messagingInit } from "@/lib/cec/messaging/conversations";
import { deliveryInit } from "@/lib/cec/messaging/delivery";
import { flush, quant } from "@/lib/cec/quant";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function response(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
async function error(e: any) {
  const status = e.status || 500;
  if (status >= 500) (await recordServerError());
  return response(
    {
      error:
        status === 500
          ? "Unable to complete this request. Please try again."
          : e.message,
    },
    status,
  );
}
async function principal(req: NextRequest) {
  return (await user(req.cookies.get("cec_session")?.value));
}
async function handleGET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const path = (await params).path.join("/");
    if (path === "club-calendar") return new NextResponse((await clubCalendar(req.nextUrl.searchParams.get("token")||"")),{headers:{"Content-Type":"text/calendar; charset=utf-8","Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
    if (path === "health") {
      (await db().prepare("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1").get());
      return response({ok:true,storage:process.env.CEC_STORAGE === "postgres" ? "postgres" : "sqlite"});
    }
    const u = (await principal(req));
    if (path === "calendar/feed")
      return new NextResponse(
        (await calendarFeed(req.nextUrl.searchParams.get("token") || "")),
        {
          headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Cache-Control": "private, no-store",
            "Referrer-Policy": "no-referrer",
          },
        },
      );
    if (path === "invite")
      return response((await inviteInfo(req.nextUrl.searchParams.get("code") || "")));
    if (path === "state") return response((await state(u)));
    if (path === "portal/state") return response(await portalState(u));
    if (path === "directory")
      return response({
        people: (await db()
          .prepare(
            "SELECT id,name,interests FROM users WHERE shared=1 AND role IN ('member','officer')",
          )
          .all()),
        projects: (await asyncFilter((await items("project")), async (r) =>
              r.data.shared &&
              (await db()
                .prepare("SELECT 1 FROM users WHERE id=? AND shared=1")
                .get(r.owner)),
          ))
          .map((r) => ({
            id: r.id,
            owner: r.owner,
            title: r.data.title,
            description: r.data.description,
            url: r.data.url,
            stage: r.data.stage,
          })),
      });
    if (path === "calendar") {
      const eventId = req.nextUrl.searchParams.get("event");
      const events = (await items("event")).filter(
        (r) => r.data.status === "published" && (!eventId || r.id === eventId),
      );
      const esc = (s: string) =>
        s
          .replace(/\\/g, "\\\\")
          .replace(/\r?\n/g, "\\n")
          .replace(/;/g, "\\;")
          .replace(/,/g, "\\,");
      const stamp = (s: string) =>
        new Date(s)
          .toISOString()
          .replace(/[-:]/g, "")
          .replace(/\.\d{3}/, "");
      const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Club OS//CEC//EN",
        "CALSCALE:GREGORIAN",
        ...events.flatMap((e) => [
          "BEGIN:VEVENT",
          "UID:" + e.id + "@clubos.local",
          "DTSTAMP:" + stamp(e.updated_at),
          "DTSTART:" + stamp(e.data.starts_at),
          "DTEND:" + stamp(e.data.ends_at),
          "SUMMARY:" + esc(e.data.title),
          "LOCATION:" + esc(e.data.location),
          "DESCRIPTION:" + esc(e.data.description),
          "END:VEVENT",
        ]),
        "END:VCALENDAR",
      ];
      // RFC 5545 folding at 75 UTF-8 octets, without splitting a code point.
      const fold = (s: string) => {
        const parts: string[] = [];
        let line = "";
        for (const ch of s) {
          if (Buffer.byteLength(line + ch) > 75) {
            parts.push(line);
            line = " " + ch;
          } else line += ch;
        }
        parts.push(line);
        return parts.join("\r\n");
      };
      return new NextResponse(lines.map(fold).join("\r\n") + "\r\n", {
        headers: {
          "Content-Type": "text/calendar; charset=utf-8",
          "Content-Disposition": 'attachment; filename="cec-events.ics"',
          "Cache-Control": "no-store",
        },
      });
    }
    if (!u) fail("Sign in to continue.", 401);
    if (path === "officer-tools/state") return response((await toolsState(u)));
    if (path === "email/state") return response((await emailState(u)));
    if (path === "memberships/state") return response((await membershipState(u)));
    if (path === "schedule/state") return response((await scheduleState(u)));
    if (path === "interviews/state") {
      (await interviewsInit());
      return response((await interviewState(u)));
    }
    if (path === "behavior/self") return response((await behaviorState(u)));
    if (path === "factors/state") return response((await factorState(u)));
    if (path === "planning/readiness") return response((await planningReadiness(u)));
    if (path === "messaging/state") return response((await messagingState(u)));
    if (path === "upnext") {
      const base = (await upNext(u));
      // The caller's OWN unread, shown to the caller. That is the mirror test
      // satisfied, not a breach of the messaging wall: the wall stops private
      // conversation becoming evidence or signal, not a person seeing their
      // own inbox. Nothing here is stored, scored or shown to anyone else.
      (await messagingInit());
      (await deliveryInit());
      const inbox = (await inboxSummary(u));
      return response({
        ...base,
        directed: {
          mentions: inbox.total_mentions,
          messages: inbox.total_unread,
        },
        ambient: inbox.total_unread > 0,
      });
    }
    if (path === "invites/state") return response((await inviteState(u)));
    if (path === "assets/state") return response((await assetState(u)));
    if (path.startsWith("attendance/")) {
      const eventId = path.slice(11);
      return response((await attendanceState(u, eventId)));
    }
    if (path === "behavior/registry") return response({ rows: (await registryLatest(u)) });
    if (path === "opportunities/state") return response((await opportunityState(u)));
    if (path === "evidence") return response((await evidenceRead(u)));
    if (path.startsWith("adaptive/"))
      return response((await adaptiveRead(u, path.slice(9))));
    if (path === "export") {
      const data = {
        ...(await state(u)),
        portal: await portalState(u),
        adaptive: (await adaptiveRead(u, "me")),
        ...(u.role !== "applicant"
          ? { schedule: (await scheduleState(u)), evidence: (await evidenceRead(u)) }
          : {}),
      };
      return new NextResponse(JSON.stringify(data, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": 'attachment; filename="cec-record.json"',
          "Cache-Control": "no-store",
        },
      });
    }
    fail("Not found.", 404);
  } catch (e) {
    return (await error(e));
  }
}
async function handlePOST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const origin = process.env.CEC_ORIGIN || req.nextUrl.origin;
    if (req.headers.get("origin") !== origin)
      fail("Request origin is not allowed.", 403);
    if (!req.headers.get("content-type")?.startsWith("application/json"))
      fail("JSON required.", 415);
    if (Number(req.headers.get("content-length") || 0) > 65536)
      fail("Request too large.", 413);
    const reader = req.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (reader) {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > 65536) {
          await reader.cancel();
          fail("Request too large.", 413);
        }
        chunks.push(value);
      }
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    let b: any;
    try {
      b = JSON.parse(raw);
    } catch {
      fail("Invalid JSON.");
    }
    if (!b || typeof b !== "object" || Array.isArray(b))
      fail("JSON object required.");
    const path = (await params).path.join("/");
    if (path === "email/reset/request") return response((await requestReset(b)));
    if (path === "email/reset/confirm") return response((await consumeEmailToken("reset",b)));
    if (path === "email/verify/confirm") return response((await consumeEmailToken("verify",b)));
    if (path === "invite/claim") {
      const result = (await claim(b));
      const r = response({ ok: true, name: result.name });
      r.cookies.set("cec_session", result.token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 604800,
      });
      return r;
    }
    if (path.startsWith("auth/")) {
      (await throttle("auth:global", 200));
      const action = path.slice(5);
      if (action === "logout") {
        const token = req.cookies.get("cec_session")?.value;
        if (token)
          (await db().prepare("DELETE FROM sessions WHERE token=?").run(hash(token)));
        const r = response({ ok: true });
        r.cookies.delete("cec_session");
        return r;
      }
      const result = (await auth(action, b));
      const r = response({ ok: true });
      if (result.token)
        r.cookies.set("cec_session", result.token, {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 604800,
        });
      return r;
    }
    const u = (await principal(req));
    if (!u) fail("Sign in to continue.", 401);
    (await throttle("mutate:" + u.id, 500));
    if (path.startsWith("portal/")) return response(await portalAction(u,path.slice(7),b));
    if (path.startsWith("officer-tools/")) { const result=(await toolsAction(u,path.slice(14),b)); await flush(); return response(result); }
    if (path.startsWith("email/")) return response((await emailAction(u,path.slice(6),b)));
    if (path === "memberships/change") return response((await changeMembership(u,b)));
    if (path.startsWith("interviews/")) {
      (await interviewsInit());
      return response((await interviews(u, path.slice(11), b)));
    }
    if (path.startsWith("assets/")) return response((await assets(u, path.slice(7), b)));
    if (path.startsWith("checkin/")) return response((await checkin(u, path.slice(8), b)));
    if (path.startsWith("invites/"))
      return response((await invites(u, path.slice(8), b)));
    if (path.startsWith("opportunities/"))
      return response((await opportunities(u, path.slice(14), b)));
    if (path.startsWith("outcomes/"))
      return response((await outcomes(u, path.slice(9), b)));
    if (path.startsWith("behavior/"))
      return response((await behavior(u, path.slice(9), b)));
    if (path.startsWith("schedule/"))
      return response((await schedule(u, path.slice(9), b)));
    if (path.startsWith("evidence/"))
      return response((await evidenceAction(u, path.slice(9), b)));
    if (path.startsWith("adaptive/"))
      return response((await adaptive(u, path.slice(9), b)));
    if (path.startsWith("integrations/"))
      return response((await integrations(u, path.slice(13), b)));
    if (path.startsWith("messaging/"))
      return response((await messaging(u, path.slice(10), b)));
    if (path.startsWith("planning/"))
      return response(await planning(u, path.slice(9), b));
    if (path.startsWith("recommendations/"))
      return response((await recommendations(u, path.slice(16), b)));
    if (path === "quant/retry") {
      (await officer(u));
      await flush(true);
      return response({ ok: true });
    }
    if (path === "quant/forecast") {
      (await officer(u));
      const event = (await item(String(b.event_id), "event"));
      if (event.data.status !== "published")
        fail("Publish this event before forecasting.");
      await flush();
      if (
        (
          (await db()
            .prepare("SELECT COUNT(*) n FROM outbox WHERE delivered=0")
            .get()) as any
        ).n
      )
        fail(
          "Record synchronization is pending. Retry synchronization first.",
          409,
        );
      return response(await quant({ action: "forecast", event_id: event.id }));
    }
    if (path === "quant/plan") {
      (await officer(u));
      return response(await quant({ action: "plan", input: b }));
    }
    const result = (await mutate(u, path, b));
    await flush();
    return response({ ...result, ok: true });
  } catch (e) {
    return (await error(e));
  }
}

export async function GET(req: NextRequest, context: {params: Promise<{path: string[]}>}) {
  try { return await databaseRequest(() => handleGET(req, context)); }
  catch { return response({error: "Database unavailable. Please try again shortly."}, 503); }
}
export async function POST(req: NextRequest, context: {params: Promise<{path: string[]}>}) {
  try { return await databaseRequest(() => handlePOST(req, context)); }
  catch { return response({error: "Database unavailable. Please try again shortly."}, 503); }
}
