import { asyncMap } from "./async";
import { randomBytes } from 'node:crypto';
import { db, tx, officer, items, item, entity, id, hash, text, timestamp, audit, clubRole, type User } from './db';
import { mutate } from './service';
import { parseCSV } from './csv';
import { evidenceInit } from './evidence';
import { opportunitiesInit } from './opportunities';
import { assetsInit, assetState } from './assets';
export async function officerToolsInit() {
    (await db().exec(`CREATE TABLE IF NOT EXISTS import_batches(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL REFERENCES accounts(id),kind TEXT NOT NULL,fingerprint TEXT NOT NULL,result TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(kind,fingerprint));
    CREATE TABLE IF NOT EXISTS roster_prospects(email TEXT PRIMARY KEY,name TEXT NOT NULL,importer_id TEXT NOT NULL REFERENCES accounts(id),created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS meeting_followups(meeting_id TEXT NOT NULL REFERENCES records(id),request_id TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(meeting_id,request_id));
    CREATE TABLE IF NOT EXISTS handoff_packets(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES accounts(id),recipient_id TEXT NOT NULL REFERENCES accounts(id),title TEXT NOT NULL,notes TEXT NOT NULL,snapshot TEXT NOT NULL,checklist TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,accepted_at TEXT,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS club_calendar_events(event_id TEXT PRIMARY KEY REFERENCES records(id),version INTEGER NOT NULL,payload TEXT NOT NULL);`));
    (await evidenceInit());
    (await opportunitiesInit());
    (await assetsInit());
}
function invalid(message: string): never { throw Object.assign(new Error(message), { status: 400 }); }
function canonical(v: unknown) { return String(v || '').trim().toLowerCase(); }
function email(v: unknown) { const e = canonical(v); if (e.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    invalid('Enter a valid email.'); return e; }
export async function importPreview(u: User, b: any) {
    (await officer(u));
    (await officerToolsInit());
    if (!['contacts', 'roster', 'attendance'].includes(b.kind))
        invalid('Choose an import type.');
    if (typeof b.csv !== 'string')
        invalid('Supply CSV text.');
    let parsed;
    try {
        parsed = parseCSV(b.csv);
    }
    catch (e: any) {
        invalid(e.message);
    }
    const { headers, rows } = parsed, mapping = b.mapping || {};
    const get = (r: string[], key: string) => r[headers.indexOf(String(mapping[key] || key).toLowerCase())] || '';
    const seen = new Set<string>();
    const contacts = (await items('contact'));
    const event = b.kind === 'attendance' ? (await item(text(b.event_id), 'event')) : null;
    const output = (await asyncMap(rows, async (r, index) => {
        let data: any = {}, key = '', status = 'add', problem = '';
        try {
            if (b.kind === 'contacts') {
                if (get(r, 'notes').length > 2000)
                    invalid('Notes must be at most 2,000 characters.');
                data = (await entity(u, 'contact', { title: get(r, 'name'), organization: get(r, 'organization'), email: email(get(r, 'email')), relationship: get(r, 'relationship') || 'Sponsor', notes: get(r, 'notes') }));
                key = data.email;
                if (contacts.some(c => canonical(c.data.email) === key))
                    status = 'duplicate';
            }
            else if (b.kind === 'roster') {
                data = { name: text(get(r, 'name'), 160), email: email(get(r, 'email')) };
                key = data.email;
                if ((await db().prepare('SELECT 1 FROM users WHERE email=?').get(key)) || (await db().prepare('SELECT 1 FROM roster_prospects WHERE email=?').get(key)))
                    status = 'duplicate';
            }
            else {
                const address = email(get(r, 'email')), person = (await db().prepare("SELECT id FROM users WHERE email=? AND role IN('member','officer')").get(address)) as any;
                if (!person)
                    invalid('No active member matches this email.');
                const existing = (await db().prepare('SELECT attendance FROM rsvps WHERE event_id=? AND user_id=?').get(event!.id, person.id)) as any;
                if (!existing)
                    invalid('Member must already be registered for this event.');
                const attendance = canonical(get(r, 'attendance'));
                if (!['present', 'absent'].includes(attendance))
                    invalid('Attendance must explicitly be present or absent.');
                if (event!.data.starts_at > timestamp())
                    invalid('Attendance opens at event start.');
                if (existing.attendance && existing.attendance !== attendance)
                    invalid('Existing attendance differs. Review it in the event before importing.');
                status = existing.attendance === attendance ? 'duplicate' : 'add';
                data = { email: address, user_id: person.id, event_id: event!.id, status: attendance };
                key = address;
            }
            if (seen.has(key))
                status = 'duplicate';
            seen.add(key);
        }
        catch (e: any) {
            status = 'error';
            problem = e.message;
        }
        return { row: index + 2, status, problem, data };
    }));
    const fingerprint = hash(JSON.stringify({ kind: b.kind, csv: b.csv, mapping, event: b.event_id || '' }));
    return { headers, rows: output, fingerprint, revision: hash(JSON.stringify({ output, eventVersion: event?.version })), added: output.filter(r => r.status === 'add').length, errors: output.filter(r => r.status === 'error').length };
}
export async function toolsState(u: User) {
    (await officer(u));
    (await officerToolsInit());
    const all = (await items()), now = timestamp();
    return { user: { id: u.id }, people: (await db().prepare("SELECT id,name,email,role FROM users WHERE role IN('member','officer')").all()),
        tasks: all.filter(r => r.kind === 'task'), meetings: (await asyncMap(all.filter(r => r.kind === 'meeting'), async r=>({...r,data:{...r.data,followup_task_ids:(await db().prepare('SELECT result FROM meeting_followups WHERE meeting_id=?').all(r.id)).flatMap((link:any)=>JSON.parse(link.result).tasks)}}))), events: all.filter(r => r.kind === 'event'),
        overdue: all.filter(r => r.kind === 'task' && !['completed', 'cancelled'].includes(r.data.status) && r.data.due_at < now),
        review: all.filter(r => r.kind === 'task' && r.data.status === 'submitted'),
        upcoming: all.filter(r => r.kind === 'event' && r.data.status === 'published' && r.data.ends_at >= now).sort((a, b) => a.data.starts_at.localeCompare(b.data.starts_at)),
        followups: all.filter(r => r.kind === 'deal' && !['fulfilled', 'lost'].includes(r.data.stage)),
        documents: all.filter(r => r.kind === 'doc'), assets: (await assetState(u)),
        prospects: (await db().prepare("SELECT email,name,created_at FROM roster_prospects WHERE NOT EXISTS(SELECT 1 FROM users WHERE users.email=roster_prospects.email AND users.role IN ('member','officer')) ORDER BY created_at DESC").all()),
        batches: (await db().prepare('SELECT id,kind,result,created_at FROM import_batches ORDER BY created_at DESC LIMIT 20').all()).map((r: any) => ({ ...r, result: JSON.parse(r.result) })),
        packets: (await db().prepare('SELECT * FROM handoff_packets ORDER BY created_at DESC').all()).map((r: any) => ({ ...r, checklist: JSON.parse(r.checklist), snapshot: JSON.parse(r.snapshot) })),
        calendarEnabled: !!(await db().prepare("SELECT 1 FROM settings WHERE key='club_calendar_hash'").get()) };
}
export async function toolsAction(u: User, action: string, b: any): Promise<any> {
    (await officer(u));
    (await officerToolsInit());
    if (action === 'import/preview')
        return (await importPreview(u, b));
    if (action === 'import/commit')
        return (await tx(async () => {
            const preview = (await importPreview(u, b));
            const prior = (await db().prepare('SELECT result FROM import_batches WHERE kind=? AND fingerprint=?').get(b.kind, preview.fingerprint)) as any;
            if (prior)
                return { ...JSON.parse(prior.result), replayed: true };
            if (preview.revision !== b.revision)
                throw Object.assign(Error('Import matches changed. Preview again.'), { status: 409 });
            if (preview.errors)
                invalid('Resolve invalid rows before importing.');
            const batch = id(), created: string[] = [], records: {row:number; reference:string}[] = [];
            for (const row of preview.rows.filter(r => r.status === 'add')) {
                if (b.kind === 'contacts')
                    created.push(((await mutate(u, 'create', { kind: 'contact', data: row.data })) as any).id);
                else if (b.kind === 'roster')
                    (await db().prepare('INSERT INTO roster_prospects VALUES(?,?,?,?)').run(row.data.email, row.data.name, u.id, timestamp()));
                else
                    (await mutate(u, 'attendance', row.data));
                records.push({row:row.row,reference:b.kind==='contacts'?created[created.length-1]:b.kind==='roster'?row.data.email:row.data.event_id+':'+row.data.user_id});
            }
            const result = { id: batch, added: preview.added, skipped: preview.rows.length - preview.added, created, records };
            (await db().prepare('INSERT INTO import_batches VALUES(?,?,?,?,?,?)').run(batch, u.id, b.kind, preview.fingerprint, JSON.stringify(result), timestamp()));
            (await audit(u, 'import.commit', batch, { kind: b.kind, added: result.added, skipped: result.skipped }));
            return result;
        }));
    if (action === 'meeting/commit')
        return (await tx(async () => {
            const meeting = (await item(text(b.meeting_id), 'meeting')), request = text(b.request_id, 100);
            const prior = (await db().prepare('SELECT result FROM meeting_followups WHERE meeting_id=? AND request_id=?').get(meeting.id, request)) as any;
            if (prior) {
                const result = JSON.parse(prior.result);
                if (result.fingerprint !== hash(JSON.stringify({ decision: b.decision, tasks: b.tasks })))
                    throw Object.assign(Error('This confirmation key was used for different follow-ups. Reopen the meeting.'), { status: 409 });
                return result;
            }
            if (meeting.version !== b.version)
                throw Object.assign(Error('Meeting changed. Reload before confirming.'), { status: 409 });
            const decision = text(b.decision, 4000);
            if (!Array.isArray(b.tasks) || b.tasks.length > 20)
                invalid('Use at most 20 follow-ups.');
            const drafts = (await asyncMap(b.tasks, async (t: any) => (await entity(u, 'task', { ...t, status: 'assigned', origin: 'Meeting: ' + meeting.data.title }))));
            (await mutate(u, 'update', { id: meeting.id, version: meeting.version, data: { ...meeting.data, decision } }));
            const tasks = (await asyncMap(drafts, async (data: any) => ((await mutate(u, 'create', { kind: 'task', data })) as any).id));
            const result = { tasks, fingerprint: hash(JSON.stringify({ decision: b.decision, tasks: b.tasks })) };
            (await db().prepare('INSERT INTO meeting_followups VALUES(?,?,?)').run(meeting.id, request, JSON.stringify(result)));
            (await audit(u, 'meeting.followups', meeting.id, { tasks }));
            return result;
        }));
    if (action === 'handoff/create')
        return (await tx(async () => {
            const recipient = text(b.recipient_id);
            if ((await clubRole(recipient)) !== 'officer')
                invalid('Select a current officer. Promote the recipient in People before preparing the handoff.');
            if (recipient === u.id)
                invalid('Choose another officer.');
            const s = (await toolsState(u)), key = id();
            const snapshot = { tasks: s.tasks.filter(r => !['completed', 'cancelled'].includes(r.data.status)), documents: s.documents, followups: s.followups, assets: s.assets.orphan_risk };
            const checklist = ['Review open commitments', 'Confirm access to key documents', 'Verify account and asset custody', 'Review sponsor follow-ups'].map(label => ({ label, done: false }));
            (await db().prepare('INSERT INTO handoff_packets(id,owner_id,recipient_id,title,notes,snapshot,checklist,created_at) VALUES(?,?,?,?,?,?,?,?)').run(key, u.id, recipient, text(b.title, 160), String(b.notes || '').slice(0, 4000), JSON.stringify(snapshot), JSON.stringify(checklist), timestamp()));
            (await audit(u, 'handoff.create', key, { recipient }));
            return { id: key };
        }));
    if (action === 'handoff/check' || action === 'handoff/accept')
        return (await tx(async () => {
            const p = (await db().prepare('SELECT * FROM handoff_packets WHERE id=?').get(text(b.id))) as any;
            if (!p || p.recipient_id !== u.id)
                throw Object.assign(Error('Only the receiving officer can acknowledge this packet.'), { status: 403 });
            if (p.version !== b.version || p.accepted_at)
                throw Object.assign(Error('Packet changed or is already accepted. Refresh.'), { status: 409 });
            const checklist = JSON.parse(p.checklist);
            if (action === 'handoff/check') {
                if (!Number.isInteger(b.index) || !checklist[b.index] || typeof b.done !== 'boolean')
                    invalid('Choose a checklist item.');
                checklist[b.index].done = b.done;
            }
            else if (checklist.some((c: any) => !c.done))
                invalid('Complete the checklist before accepting.');
            (await db().prepare('UPDATE handoff_packets SET checklist=?,accepted_at=?,version=version+1 WHERE id=?').run(JSON.stringify(checklist), action === 'handoff/accept' ? timestamp() : null, p.id));
            (await audit(u, action, p.id, { index: b.index ?? null }));
            return { ok: true };
        }));
    if (action === 'calendar/enable')
        return (await tx(async () => {
            const token = randomBytes(32).toString('hex');
            (await db().prepare("INSERT INTO settings VALUES('club_calendar_hash',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(hash(token)));
            (await audit(u, 'calendar.rotate', 'cec', {}));
            return { token };
        }));
    if (action === 'calendar/disable')
        return (await tx(async () => { (await db().prepare("DELETE FROM settings WHERE key='club_calendar_hash'").run()); (await audit(u, 'calendar.disable', 'cec', {})); return { ok: true }; }));
    throw Object.assign(Error('Unknown officer tool action.'), { status: 404 });
}
function escapeICS(v: unknown) { return String(v || '').replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,'); }
export async function clubCalendar(token: string) {
    const setting = (await db().prepare("SELECT value FROM settings WHERE key='club_calendar_hash'").get()) as any;
    if (!/^[a-f0-9]{64}$/.test(token) || !setting || setting.value !== hash(token))
        throw Object.assign(Error('Calendar subscription unavailable.'), { status: 404 });
    (await officerToolsInit());
    const stamp = (value: string) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Club OS//CEC Calendar//EN', 'X-WR-CALNAME:Cornell Entrepreneurship Club'];
    (await tx(async () => {
        for (const event of (await items('event'))) {
            const old = (await db().prepare('SELECT * FROM club_calendar_events WHERE event_id=?').get(event.id)) as any;
            if (event.data.status !== 'published' && !old)
                continue;
            const payload = { ...(event.data.status === 'draft' && old ? JSON.parse(old.payload) : event.data), cancelled: event.data.status === 'draft' };
            (await db().prepare('INSERT INTO club_calendar_events VALUES(?,?,?) ON CONFLICT(event_id) DO UPDATE SET version=excluded.version,payload=excluded.payload').run(event.id, event.version, JSON.stringify(payload)));
            lines.push('BEGIN:VEVENT', 'UID:' + event.id + '@clubos-cec', 'SEQUENCE:' + event.version, 'DTSTAMP:' + stamp(event.updated_at), 'DTSTART:' + stamp(payload.starts_at), 'DTEND:' + stamp(payload.ends_at), 'SUMMARY:' + escapeICS(payload.title), 'LOCATION:' + escapeICS(payload.location), 'DESCRIPTION:' + escapeICS(payload.description), 'STATUS:' + (payload.cancelled ? 'CANCELLED' : 'CONFIRMED'), 'END:VEVENT');
        }
    }));
    lines.push('END:VCALENDAR');
    return lines.map(line => { let out = '', part = ''; for (const ch of line) {
        if (Buffer.byteLength(part + ch) > 75) {
            out += part + '\r\n';
            part = ' ';
        }
        part += ch;
    } return out + part; }).join('\r\n') + '\r\n';
}
