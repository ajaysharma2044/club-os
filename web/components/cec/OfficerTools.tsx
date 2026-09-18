"use client";
import { useEffect, useState, useRef, type FormEvent } from 'react';
import Link from 'next/link';
import './cec.css';
import type { Item } from '@/lib/cec/db';
type Person = {
    id: string;
    name: string;
    email: string;
    role: string;
};
type Packet = {
    id: string;
    title: string;
    notes: string;
    recipient_id: string;
    version: number;
    accepted_at: string | null;
    created_at: string;
    checklist: {
        label: string;
        done: boolean;
    }[];
    snapshot: {
        tasks: Item[];
        documents: Item[];
        followups: Item[];
        assets: {
            id: string;
            name: string;
            location: string;
            holder_id: string;
            role_key: string;
        }[];
    };
};
type ToolsState = {
    user: {
        id: string;
    };
    people: Person[];
    tasks: Item[];
    meetings: Item[];
    events: Item[];
    overdue: Item[];
    review: Item[];
    upcoming: Item[];
    followups: Item[];
    documents: Item[];
    assets: {
        stranded: unknown[];
        single_point: unknown[];
    };
    prospects: {
        email: string;
        name: string;
    }[];
    batches: {
        id: string;
        kind: string;
        created_at: string;
        result: {
            added: number;
            skipped: number;
        };
    }[];
    packets: Packet[];
    calendarEnabled: boolean;
};
async function post(path: string, body: unknown) { const r = await fetch('/api/cec/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const data = await r.json(); if (!r.ok)
    throw Error(data.error || 'Unable to save.'); window.dispatchEvent(new Event('cec:changed')); return data; }
const send = (path: string, body: unknown) => post('officer-tools/' + path, body);
export default function OfficerTools() {
    const [state, setState] = useState<ToolsState | null>(null), [error, setError] = useState(''), [tab, setTab] = useState('Overview');
    const readSequence = useRef(0);
    async function load() {
        const sequence = ++readSequence.current;
        try {
            const r = await fetch('/api/cec/officer-tools/state');
            const data = await r.json();
            if (sequence !== readSequence.current) return;
            if (!r.ok) { if (r.status === 401 || r.status === 403) setState(null); throw Error(data.error); }
            setState(data); setError('');
        } catch (error) { if (sequence === readSequence.current) throw error; }
    }
    useEffect(() => { load().catch(e => setError(e.message)); return () => { readSequence.current++; }; }, []);
    const tabs = ['Overview', 'Imports', 'Meeting follow-ups', 'Handoff', 'Calendar'];
    return <div className="cec embedded officer-tools"><header className="page-head"><div><h1>Officer workspace</h1><p>Review what needs attention, bring in your records, and prepare the next team.</p></div><Link className="link" href="/clubs/cec/workspace">Back to tasks</Link></header>
    {error && <p role="alert" className="notice error">{error} <a href="/clubs/cec/settings">Account settings</a></p>}
    {!state ? <button className="button" onClick={() => load().catch(e => setError(e.message))}>Load officer workspace</button> : <>
      <button className="button secondary small" onClick={() => load().catch(e => setError(e.message))}>Refresh officer records</button>
      <nav className="task-filters" aria-label="Officer tools">{tabs.map(t => <button key={t} className="button secondary" aria-pressed={tab === t} onClick={() => setTab(t)}>{t}</button>)}</nav>
      {tab === 'Overview' && <Overview state={state}/>}
      {tab === 'Imports' && <Imports state={state} reload={load}/>}
      {tab === 'Meeting follow-ups' && <Meetings state={state} reload={load}/>}
      {tab === 'Handoff' && <Handoffs state={state} reload={load}/>}
      {tab === 'Calendar' && <Calendar enabled={state.calendarEnabled} reload={load}/>}
    </>}
  </div>;
}
function Overview({ state: s }: {
    state: ToolsState;
}) {
    const groups: [
        string,
        Item[],
        string
    ][] = [['Overdue commitments', s.overdue, '/clubs/cec/workspace#task-'], ['Waiting for review', s.review, '/clubs/cec/workspace#task-'], ['Upcoming events', s.upcoming, '/clubs/cec/events'], ['Sponsor follow-ups', s.followups, '/clubs/cec/money?tab=Opportunities']];
    return <><p className="muted">Current club records. Refresh to check for updates.</p><div className="columns">{groups.map(([title, rows, href]) => <section className="panel" key={title}><h2>{title} ({rows.length})</h2>{rows.length ? rows.map(r => <div className="row" key={r.id}><div><strong>{r.data.title}</strong><small>{r.kind === 'task' ? `${s.people.find(p => p.id === r.data.assignee)?.name || 'Member'} · ${new Date(r.data.due_at).toLocaleString()}` : r.kind === 'deal' ? r.data.next_step || 'Record the next follow-up.' : new Date(r.data.starts_at).toLocaleString()}</small></div><a className="link" href={href + (r.kind === 'task' ? r.id : '')}>{r.data.status === 'submitted' ? 'Review work' : 'Open'}</a></div>) : <p className="muted">Nothing here right now.</p>}</section>)}</div>
    <section className="panel"><h2>Continuity checks</h2><p>{s.assets.stranded.length} assets without recorded access · {s.assets.single_point.length} assets with one access holder · {s.prospects.length} imported roster prospects for review</p><a className="link" href="/clubs/cec/people">Manage membership and invitations</a></section></>;
}
type Preview = {
    revision: string;
    added: number;
    errors: number;
    headers: string[];
    rows: {
        row: number;
        status: string;
        problem: string;
        data: Record<string, unknown>;
    }[];
};
function Imports({ state, reload }: {
    state: ToolsState;
    reload: () => Promise<void>;
}) {
    const [kind, setKind] = useState('contacts'), [csv, setCsv] = useState(''), [mapping, setMapping] = useState<Record<string, string>>({}), [event, setEvent] = useState('');
    const [preview, setPreview] = useState<Preview | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
    const fields = kind === 'contacts' ? ['name', 'organization', 'email', 'relationship', 'notes'] : kind === 'roster' ? ['name', 'email'] : ['email', 'attendance'];
    async function act(commit: boolean) { setBusy(true); setError(''); setNotice(''); try {
        const result = await send('import/' + (commit ? 'commit' : 'preview'), { kind, csv, mapping, event_id: event, revision: preview?.revision });
        if (commit) {
            setNotice(`${result.added} rows imported; ${result.skipped} duplicates skipped.`);
            setPreview(null);
            await reload();
        }
        else
            setPreview(result);
    }
    catch (e: any) {
        setError(e.message);
        if (commit)
            setPreview(null);
    }
    finally {
        setBusy(false);
    } }
    return <section className="panel"><h2>Import club records</h2><p>Preview every row before saving. Roster imports create prospects, not accounts or membership. Attendance requires an existing registered member.</p>
    <label className="field">Import type<select value={kind} disabled={busy} onChange={e => { setKind(e.target.value); setMapping({}); setPreview(null); }}><option value="contacts">Sponsor contacts</option><option value="roster">Roster prospects</option><option value="attendance">Attendance</option></select></label>
    {kind === 'attendance' && <label className="field">Event<select disabled={busy} value={event} onChange={e => { setEvent(e.target.value); setPreview(null); }}><option value="">Choose event</option>{state.events.map(r => <option value={r.id} key={r.id}>{r.data.title}</option>)}</select></label>}
    <label className="field">CSV file (48 KB / 100 rows)<input type="file" accept=".csv,text/csv" disabled={busy} onChange={async (e) => { const file = e.target.files?.[0]; if (!file)
        return; if (file.size > 48000) {
        setError('CSV must be at most 48 KB.');
        return;
    } setBusy(true); setError(''); try { setCsv(await file.text()); setMapping({}); setPreview(null); } catch { setError('Unable to read this file. Try pasting its CSV text.'); } finally { setBusy(false); } }}/></label>
    <label className="field">CSV text<textarea rows={7} value={csv} disabled={busy} onChange={e => { setCsv(e.target.value); setPreview(null); }} placeholder={fields.join(',')}/></label>
    <details><summary>Map columns (optional)</summary><p>Enter the header in your file that corresponds to each field.</p><div className="form-grid">{fields.map(field => <label className="field" key={field}>{field}<input value={mapping[field] || ''} placeholder={field} disabled={busy} onChange={e => { setMapping({ ...mapping, [field]: e.target.value }); setPreview(null); }}/></label>)}</div></details>
    {error && <p className="notice error" role="alert">{error}</p>}{notice && <p className="notice success" role="status">{notice}</p>}
    <div className="actions"><button className="button secondary" disabled={busy || !csv} onClick={() => act(false)}>Preview import</button>{preview && <button className="button" disabled={busy || preview.errors > 0 || preview.added === 0} onClick={() => act(true)}>Import {preview.added} rows</button>}</div>
    {preview && <><p>{preview.added} additions · {preview.errors} invalid rows · duplicates will be skipped. No existing records are overwritten.</p><div className="table-wrap"><table><thead><tr><th>Row</th><th>Outcome</th><th>Record / problem</th></tr></thead><tbody>{preview.rows.map(r => <tr key={r.row}><td>{r.row}</td><td>{r.status}</td><td>{r.problem || Object.entries(r.data).filter(([k]) => !k.endsWith('_id')).map(([k, v]) => `${k}: ${v}`).join(' · ')}</td></tr>)}</tbody></table></div></>}
    <h3>Recent imports</h3>{state.batches.length ? state.batches.map(b => <p key={b.id}>{b.kind} · {b.result.added} added · {b.result.skipped} skipped · {new Date(b.created_at).toLocaleString()}</p>) : <p>No imports yet.</p>}
    {state.prospects.length > 0 && <details><summary>Roster prospects ({state.prospects.length})</summary>{state.prospects.map(p => <p key={p.email}>{p.name} · {p.email}</p>)}<a href="/clubs/cec/people">Create invitations in People</a></details>}
  </section>;
}
function Meetings({ state, reload }: {
    state: ToolsState;
    reload: () => Promise<void>;
}) {
    const [draftVersion, setDraftVersion] = useState(0);
    const [selected, setSelected] = useState(''), [decision, setDecision] = useState(''), [tasks, setTasks] = useState<{
        title: string;
        assignee: string;
        due_at: string;
    }[]>([]), [request, setRequest] = useState('');
    const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
    const meeting = state.meetings.find(r => r.id === selected);
    async function saveNotes(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const f = e.currentTarget, data = new FormData(f); setBusy(true); setError(''); try {
        const result = await post('create', { kind: 'meeting', data: { title: data.get('title'), starts_at: new Date(String(data.get('starts'))).toISOString(), agenda: data.get('notes'), decision: '' } });
        await reload();
        setSelected(result.id);
        setDraftVersion(1);
        setDecision('');
        setTasks([]);
        setRequest(crypto.randomUUID());
        setNotice('Meeting notes saved. Review decisions and follow-ups below.');
        f.reset();
    }
    catch (e: any) {
        setError(e.message);
    }
    finally {
        setBusy(false);
    } }
    async function confirm() { setBusy(true); setError(''); try {
        const result = await send('meeting/commit', { meeting_id: selected, version: draftVersion, request_id: request, decision, tasks: tasks.map(t => ({ ...t, due_at: new Date(t.due_at).toISOString() })) });
        setNotice(`Decision confirmed and ${result.tasks.length} follow-up${result.tasks.length === 1 ? '' : 's'} assigned.`);
        setTasks([]);
        setSelected('');
        setDecision('');
        setRequest(crypto.randomUUID());
        await reload();
    }
    catch (e: any) {
        setError(e.message);
    }
    finally {
        setBusy(false);
    } }
    return <section className="panel"><h2>Meeting → decisions → tasks</h2><p>Paste notes you are authorized to share. Confirm the decision text and choose each owner and deadline.</p>
    <details><summary>Save a new meeting</summary><form onSubmit={saveNotes} className="form-grid"><label className="field">Meeting title<input disabled={busy} name="title" required maxLength={180}/></label><label className="field">Meeting time<input disabled={busy} name="starts" type="datetime-local" required/></label><label className="field">Notes / agenda<textarea disabled={busy} name="notes" required maxLength={4000} rows={5}/></label><button className="button" disabled={busy}>Save meeting notes</button></form></details>
    <label className="field">Meeting<select disabled={busy} value={selected} onChange={e => { setSelected(e.target.value); setDraftVersion(state.meetings.find(r => r.id === e.target.value)?.version || 0); setDecision(state.meetings.find(r => r.id === e.target.value)?.data.decision || ''); setTasks([]); setRequest(crypto.randomUUID()); setNotice(''); }}><option value="">Choose a meeting</option>{state.meetings.map(r => <option key={r.id} value={r.id}>{r.data.title}</option>)}</select></label>
    {meeting && <><div className="notice"><h3>Saved notes</h3><p style={{ whiteSpace: 'pre-wrap' }}>{meeting.data.agenda}</p></div>{meeting.data.followup_task_ids?.length>0&&<div><h3>Assigned follow-ups</h3>{meeting.data.followup_task_ids.map((taskId:string)=><p key={taskId}><a href={'/clubs/cec/workspace#task-'+taskId}>{state.tasks.find(t=>t.id===taskId)?.data.title||'Task'}</a></p>)}</div>}<label className="field">Confirmed decisions<textarea disabled={busy} value={decision} onChange={e => setDecision(e.target.value)} maxLength={4000} rows={4}/></label>
      {tasks.map((task, index) => <fieldset key={index}><legend>Follow-up {index + 1}</legend><label className="field">Task title<input disabled={busy} value={task.title} onChange={e => setTasks(tasks.map((t, i) => i === index ? { ...t, title: e.target.value } : t))}/></label><label className="field">Owner<select disabled={busy} value={task.assignee} onChange={e => setTasks(tasks.map((t, i) => i === index ? { ...t, assignee: e.target.value } : t))}><option value="">Choose owner</option>{state.people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label className="field">Due time<input disabled={busy} type="datetime-local" value={task.due_at} onChange={e => setTasks(tasks.map((t, i) => i === index ? { ...t, due_at: e.target.value } : t))}/></label><button className="button secondary" disabled={busy} onClick={() => setTasks(tasks.filter((_, i) => i !== index))}>Remove follow-up {index + 1}</button></fieldset>)}
      <div className="actions"><button className="button secondary" disabled={busy || tasks.length >= 20} onClick={() => setTasks([...tasks, { title: '', assignee: '', due_at: '' }])}>Add follow-up</button><button className="button" disabled={busy || !decision.trim() || tasks.some(t => !t.title || !t.assignee || !t.due_at)} onClick={confirm}>Confirm decisions and assign tasks</button></div></>}
    {error && <p className="notice error" role="alert">{error}</p>}{notice && <p className="notice success" role="status">{notice}</p>}
  </section>;
}
function Handoffs({ state, reload }: {
    state: ToolsState;
    reload: () => Promise<void>;
}) {
    const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
    async function act(path: string, body: unknown) { setBusy(true); setError(''); try {
        await send(path, body);
        await reload();
        setNotice('Handoff saved.');
    }
    catch (e: any) {
        setError(e.message);
    }
    finally {
        setBusy(false);
    } }
    function download(p: Packet) { const url = URL.createObjectURL(new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'cec-handoff-' + p.id + '.json'; a.click(); URL.revokeObjectURL(url); }
    return <section className="panel"><h2>Leadership handoff</h2><p>A dated packet of open commitments, key documents, sponsor relationships and asset custody. Promote the incoming officer first, prepare and review the packet, then remove outgoing officer access in People. Acceptance records review; it does not change external account access.</p>
    <form className="form-grid" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); act('handoff/create', { title: f.get('title'), recipient_id: f.get('recipient'), notes: f.get('notes') }); }}><label className="field">Packet title<input name="title" required maxLength={160}/></label><label className="field">Receiving officer<select name="recipient" required><option value="">Choose another officer</option>{state.people.filter(p => p.role === 'officer' && p.id !== state.user.id).map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label><label className="field">Handoff notes<textarea name="notes" maxLength={4000}/></label><button className="button" disabled={busy}>Create handoff packet</button></form>
    <p><a href="/clubs/cec/people">Transfer leadership or manage roles</a></p>{error && <p role="alert" className="notice error">{error}</p>}{notice && <p role="status">{notice}</p>}
    {state.packets.map(p => <article className="panel" key={p.id}><h3>{p.title}</h3><p>{new Date(p.created_at).toLocaleString()} · {p.accepted_at ? 'Accepted' : 'Awaiting receiving officer review'}</p><p>{p.notes}</p><p>For {state.people.find(x => x.id === p.recipient_id)?.name || 'Former officer'}</p>
      {p.checklist.map((c, index) => <label className="field" key={c.label}><span><input type="checkbox" checked={c.done} disabled={busy || !!p.accepted_at || p.recipient_id !== state.user.id} onChange={e => act('handoff/check', { id: p.id, version: p.version, index, done: e.target.checked })}/> {c.label}</span></label>)}
      <details><summary>Packet contents</summary><h4>Open work</h4>{p.snapshot.tasks.map(t => <p key={t.id}><a href={'/clubs/cec/workspace#task-' + t.id}>{t.data.title}</a> · {t.data.status}</p>)}<h4>Documents</h4>{p.snapshot.documents.map(d => <p key={d.id}><a href={d.data.url} target="_blank" rel="noreferrer">{d.data.title}</a></p>)}<h4>Relationships</h4>{p.snapshot.followups.map(d => <p key={d.id}>{d.data.title} · {d.data.next_step}</p>)}<h4>Asset custody</h4>{p.snapshot.assets.map(a => <p key={a.id}>{a.name} · {a.role_key || 'No role assigned'} · {a.location}</p>)}</details>
      <div className="actions"><button className="button secondary" onClick={() => download(p)}>Export packet</button>{p.recipient_id === state.user.id && !p.accepted_at && <button className="button" disabled={busy || p.checklist.some(c => !c.done)} onClick={() => act('handoff/accept', { id: p.id, version: p.version })}>Accept handoff</button>}</div>
    </article>)}{!state.packets.length && <p>No handoff packets yet.</p>}
  </section>;
}
function Calendar({ enabled, reload }: {
    enabled: boolean;
    reload: () => Promise<void>;
}) {
    const [url, setUrl] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    async function act(enable: boolean) { setBusy(true); setError(''); try {
        const result = await send('calendar/' + (enable ? 'enable' : 'disable'), {});
        setUrl(enable ? window.location.origin + '/api/cec/club-calendar?token=' + result.token : '');
        await reload();
    }
    catch (e: any) {
        setError(e.message);
    }
    finally {
        setBusy(false);
    } }
    return <section className="panel"><h2>Club calendar publishing</h2><p>Subscribe to published CEC events in Google Calendar or Outlook. Event identity stays stable when the time or location changes. Moving a published event back to draft publishes its cancellation.</p><p className="muted">Subscriptions refresh on the calendar provider’s schedule. This does not write into an existing Google/Outlook calendar. A reachable hosted URL is needed for external subscriptions; localhost works only on this computer. Disabling stops future updates; subscribers may retain previously downloaded events.</p><p>Status: {enabled ? 'Subscription enabled' : 'Disabled'}</p>
    {enabled && <p>Creating a replacement link invalidates the old subscription. Subscribers must add the replacement URL.</p>}
    <div className="actions"><button className="button" disabled={busy} onClick={() => act(true)}>{enabled ? 'Replace subscription link' : 'Enable calendar subscription'}</button>{enabled && <button className="button secondary" disabled={busy} onClick={() => act(false)}>Disable subscription</button>}</div>
    {url && <><label className="field">Subscription URL<input readOnly value={url} onFocus={e => e.target.select()}/></label><a className="link" href={url}>Download current calendar</a><p>Copy this URL into Google Calendar’s “From URL” or Outlook’s “Subscribe from web.” Save it now; reopening this page will not reveal the token.</p></>}{error && <p role="alert" className="notice error">{error}</p>}
  </section>;
}
