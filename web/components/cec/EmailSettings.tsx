"use client";
import { FormEvent, useEffect, useState } from 'react';

type Status={mode:string;verified:boolean;taskNotifications:boolean;jobs:{kind:string;status:string;created:number;error:string}[]};
export async function emailRequest(path:string,body:unknown) {
  const r=await fetch('/api/cec/email/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await r.json();if(!r.ok)throw Error(data.error||'Unable to complete this request.');return data;
}
export default function EmailSettings() {
  const [state,setState]=useState<Status|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  async function load(){const r=await fetch('/api/cec/email/state');const j=await r.json();if(!r.ok)throw Error(j.error);setState(j);}
  useEffect(()=>{let active=true;fetch('/api/cec/email/state').then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.error);if(active)setState(j);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
  async function act(path:string,body:unknown){setBusy(true);setError('');setNotice('');try{const j=await emailRequest(path,body);setNotice(j.message);await load();}catch(e:any){setError(e.message);}finally{setBusy(false);}}
  return <section className="panel" aria-label="Email settings"><h2>Email and notifications</h2>
    {error&&<p role="alert" className="notice error">{error}</p>}{notice&&<p role="status" className="notice success">{notice}</p>}
    {!state?<button className="button secondary" onClick={()=>load().catch(e=>setError(e.message))}>Load email settings</button>:<>
      <p>{state.verified?'Email address verified.':'Your email address is not verified yet.'} This does not verify university affiliation.</p>
      <p className="muted">{state.mode==='disabled'?'Email delivery is not configured yet.':state.mode==='capture'?'Local test mode: emails are captured on this server, not sent.':'Outgoing email is enabled. Provider acceptance does not confirm inbox delivery.'}</p>
      {!state.verified&&<button className="button" disabled={busy||state.mode==='disabled'} onClick={()=>act('verify/request',{})}>Send verification email</button>}
      <label className="field"><span><input type="checkbox" checked={state.taskNotifications} disabled={busy} onChange={e=>act('preferences',{taskNotifications:e.target.checked})}/> Email me task assignments and revision requests</span></label>
      <p className="muted">Task emails require a verified address. Review task details after signing in.</p>
      <a className="link" href="/recover/cec">Reset password</a>
      <h3>Recent email requests</h3><button className="button secondary small" disabled={busy} onClick={()=>load().catch(e=>setError(e.message))}>Refresh delivery status</button>
      {state.jobs.length?state.jobs.map((j,i)=><p key={i}>{j.kind} · {j.status}{j.error?' · '+j.error:''}</p>):<p className="muted">No email requests yet.</p>}
    </>}
  </section>;
}
export function EmailInvitation({code,disabled}:{code:string;disabled:boolean}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const data=new FormData(e.currentTarget);setBusy(true);setError('');setNotice('');try{const j=await emailRequest('invite',{code,email:data.get('email')});setNotice(j.message);}catch(e:any){setError(e.message);}finally{setBusy(false);}}
  return <form onSubmit={submit} className="form-grid" aria-label={'Email invitation '+code}>
    <label className="field">Recipient email<input type="email" name="email" required maxLength={254} disabled={busy||disabled}/></label>
    <button className="button secondary" disabled={busy||disabled}>Email invitation</button>
    {error&&<p role="alert" className="notice error">{error}</p>}{notice&&<p role="status">{notice}</p>}
  </form>;
}
