"use client";
import { EmailInvitation } from "./EmailSettings";
import { FormEvent, useEffect, useState } from 'react';

type Membership = { user_id:string; name:string; email:string; role:string; status:string; version:number };
export default function MemberManagement({userId}:{userId:string}) {
  const [members,setMembers]=useState<Membership[]>([]), [invites,setInvites]=useState<any[]>([]);
  const [error,setError]=useState(''), [notice,setNotice]=useState(''), [busy,setBusy]=useState(false);
  const [change,setChange]=useState<{member:Membership; action:string}|null>(null);
  async function load() {
    const responses=await Promise.all([fetch('/api/cec/memberships/state'),fetch('/api/cec/invites/state')]);
    const data=await Promise.all(responses.map(r=>r.json()));
    if(responses.some(r=>!r.ok)) throw Error('Unable to load membership controls.');
    setMembers(data[0].memberships);setInvites(data[1].invites);
  }
  useEffect(()=>{load().catch(e=>setError(e.message));},[]);
  async function post(path:string,body:any) {
    const r=await fetch('/api/cec/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const j=await r.json();if(!r.ok) throw Object.assign(Error(j.error),{status:r.status});return j;
  }
  async function makeInvite(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();const form=e.currentTarget;const fields=new FormData(form);
    setBusy(true);setError('');setNotice('');
    try {await post('invites/create',{label:fields.get('label'),email_domain:fields.get('domain'),days:7,max_uses:Number(fields.get('uses')),role:'member'});
      await load();setNotice('Member invitation created. Share its link with the intended members.');form.reset();
    } catch(e:any){setError(e.message);}finally{setBusy(false);}
  }
  async function submitChange(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();if(!change)return;const fields=new FormData(e.currentTarget);
    setBusy(true);setError('');setNotice('');
    try {
      await post('memberships/change',{action:change.action,user_id:change.member.user_id,version:change.member.version,
        actor_version:members.find(m=>m.user_id===userId)?.version,password:fields.get('password')});
      const losingAccess=change.action==='transfer'||(change.member.user_id===userId&&['demote','remove'].includes(change.action));
      setChange(null);setNotice('Membership updated.');
      if(!losingAccess) await load();
      window.dispatchEvent(new Event('cec:changed'));
    }catch(e:any){setError(e.message);if(e.status===409)setChange(null);await load().catch(()=>{});}finally{setBusy(false);}
  }
  const descriptions:Record<string,string>={
    promote:'Give this member officer access to the club workspace.',
    demote:'Remove officer privileges and keep member access.',
    remove:'Remove club access and revoke current sessions. Their work history stays.',
    restore:'Restore member access. Officer privileges are not restored automatically.',
    transfer:'Make this member an officer and change your own role to member. Other officers keep their roles.'
  };
  return <section className="panel membership-controls" aria-label="Membership controls">
    <h2>Membership controls</h2>
    {error&&<p className="notice error" role="alert">{error}</p>}
    {notice&&<p className="notice success" role="status">{notice}</p>}
    <h3>Invite members</h3>
    <form onSubmit={makeInvite} className="form-grid">
      <label className="field">Invitation label<input name="label" required maxLength={80} placeholder="Fall project team" /></label>
      <label className="field">Allowed email domain (optional)<input name="domain" defaultValue="cornell.edu" placeholder="cornell.edu" /></label>
      <label className="field">Maximum members<input name="uses" type="number" min={1} max={500} defaultValue={20} required /></label>
      <button className="button" disabled={busy}>Create 7-day member invitation</button>
    </form>
    <p className="muted">Invitations grant member access only. Existing accounts must authenticate. An email domain does not verify university affiliation.</p>
    {invites.map(invite=><div className="row" key={invite.code}>
      <div><strong>{invite.label||'Member invitation'}</strong><small>{invite.uses}/{invite.max_uses} claimed · {invite.active?'Active':'Unavailable'}</small>
        {invite.active&&<><a href={'/join/cec?i='+encodeURIComponent(invite.code)}>Open invitation {invite.code}</a><EmailInvitation code={invite.code} disabled={busy}/></>}</div>
      <button className="button secondary" disabled={busy} onClick={async()=>{
        setBusy(true);setError('');try{await post('invites/revoke',{code:invite.code});await load();setNotice('Invitation revoked.');}
        catch(e:any){setError(e.message);}finally{setBusy(false);}
      }}>Revoke invitation</button>
    </div>)}
    <h3>Roles and access</h3>
    {members.map(m=><div className="row" key={m.user_id}>
      <div><strong>{m.name}{m.user_id===userId?' (you)':''}</strong><small>{m.email} · {m.role} · {m.status}</small></div>
      <div className="actions">
        {m.status==='active'&&m.role==='member'&&<>
          <button className="button secondary" disabled={busy} onClick={()=>setChange({member:m,action:'promote'})}>Make officer</button>
          {m.user_id!==userId&&<button className="button secondary" disabled={busy} onClick={()=>setChange({member:m,action:'transfer'})}>Transfer leadership</button>}
        </>}
        {m.status==='active'&&m.role==='officer'&&<button className="button secondary" disabled={busy} onClick={()=>setChange({member:m,action:'demote'})}>Make member</button>}
        {['active','pending'].includes(m.status)?<button className="button secondary" disabled={busy} onClick={()=>setChange({member:m,action:'remove'})}>Remove access</button>:
          <button className="button secondary" disabled={busy} onClick={()=>setChange({member:m,action:'restore'})}>Restore member</button>}
      </div>
    </div>)}
    {change&&<form onSubmit={submitChange} className="panel" aria-label="Confirm membership change">
      <h3>{change.action==='transfer'?'Transfer leadership':'Change membership'}: {change.member.name}</h3>
      <p>{descriptions[change.action]}</p>
      <label className="field">Your current password<input name="password" type="password" autoFocus autoComplete="current-password" required maxLength={256}/></label>
      <div className="actions"><button className="button" disabled={busy}>Confirm change</button>
        <button type="button" className="button secondary" disabled={busy} onClick={()=>setChange(null)}>Cancel</button></div>
    </form>}
  </section>;
}
