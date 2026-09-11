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
import { flush, quant } from "@/lib/cec/quant";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function response(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
function error(e: any) {
  const status = e.status || 500;
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
function principal(req: NextRequest) {
  return user(req.cookies.get("cec_session")?.value);
}
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const path = (await params).path.join("/");
    const u = principal(req);
    if (path === "calendar/feed")
      return new NextResponse(
        calendarFeed(req.nextUrl.searchParams.get("token") || ""),
        {
          headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Cache-Control": "private, no-store",
            "Referrer-Policy": "no-referrer",
          },
        },
      );
    if (path === "invite")
      return response(inviteInfo(req.nextUrl.searchParams.get("code") || ""));
    if (path === "state") return response(state(u));
    if (path === "directory")
      return response({
        people: db()
          .prepare(
            "SELECT id,name,interests FROM users WHERE shared=1 AND role!='applicant'",
          )
          .all(),
        projects: items("project")
          .filter(
            (r) =>
              r.data.shared &&
              db()
                .prepare("SELECT 1 FROM users WHERE id=? AND shared=1")
                .get(r.owner),
          )
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
      const events = items("event").filter(
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
    if (path === "schedule/state") return response(scheduleState(u));
    if (path === "interviews/state") {
      interviewsInit();
      return response(interviewState(u));
    }
    if (path === "behavior/self") return response(behaviorState(u));
    if (path === "invites/state") return response(inviteState(u));
    if (path === "behavior/registry") return response({ rows: registryLatest(u) });
    if (path === "opportunities/state") return response(opportunityState(u));
    if (path === "evidence") return response(evidenceRead(u));
    if (path.startsWith("adaptive/"))
      return response(adaptiveRead(u, path.slice(9)));
    if (path === "export") {
      const data = {
        ...state(u),
        adaptive: adaptiveRead(u, "me"),
        ...(u.role !== "applicant"
          ? { schedule: scheduleState(u), evidence: evidenceRead(u) }
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
    return error(e);
  }
}
export async function POST(
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
    if (path === "invite/claim") {
      const result = claim(b);
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
      throttle("auth:global", 200);
      const action = path.slice(5);
      if (action === "logout") {
        const token = req.cookies.get("cec_session")?.value;
        if (token)
          db().prepare("DELETE FROM sessions WHERE token=?").run(hash(token));
        const r = response({ ok: true });
        r.cookies.delete("cec_session");
        return r;
      }
      const result = auth(action, b);
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
    const u = principal(req);
    if (!u) fail("Sign in to continue.", 401);
    throttle("mutate:" + u.id, 500);
    if (path.startsWith("interviews/")) {
      interviewsInit();
      return response(interviews(u, path.slice(11), b));
    }
    if (path.startsWith("invites/"))
      return response(invites(u, path.slice(8), b));
    if (path.startsWith("opportunities/"))
      return response(opportunities(u, path.slice(14), b));
    if (path.startsWith("outcomes/"))
      return response(outcomes(u, path.slice(9), b));
    if (path.startsWith("behavior/"))
      return response(behavior(u, path.slice(9), b));
    if (path.startsWith("schedule/"))
      return response(schedule(u, path.slice(9), b));
    if (path.startsWith("evidence/"))
      return response(evidenceAction(u, path.slice(9), b));
    if (path.startsWith("adaptive/"))
      return response(adaptive(u, path.slice(9), b));
    if (path.startsWith("recommendations/"))
      return response(recommendations(u, path.slice(16), b));
    if (path === "quant/retry") {
      officer(u);
      await flush();
      return response({ ok: true });
    }
    if (path === "quant/forecast") {
      officer(u);
      const event = item(String(b.event_id), "event");
      if (event.data.status !== "published")
        fail("Publish this event before forecasting.");
      await flush();
      if (
        (
          db()
            .prepare("SELECT COUNT(*) n FROM outbox WHERE delivered=0")
            .get() as any
        ).n
      )
        fail(
          "Record synchronization is pending. Retry synchronization first.",
          409,
        );
      return response(await quant({ action: "forecast", event_id: event.id }));
    }
    if (path === "quant/plan") {
      officer(u);
      return response(await quant({ action: "plan", input: b }));
    }
    const result = mutate(u, path, b);
    await flush();
    return response({ ...result, ok: true });
  } catch (e) {
    return error(e);
  }
}
