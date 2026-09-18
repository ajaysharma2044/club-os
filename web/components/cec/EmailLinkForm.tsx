"use client";
import { FormEvent, useEffect, useState } from 'react';
import { emailRequest } from './EmailSettings';
import './cec.css';
export default function EmailLinkForm({purpose}:{purpose:'verify'|'reset'}) {
  const [token,setToken]=useState(''),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[done,setDone]=useState(false);
  useEffect(()=>{
    const readLink=()=>{const raw=new URLSearchParams(window.location.hash.slice(1)).get('token');
      if(raw!==null){setToken(raw);setDone(false);setError('');setMessage('');}setReady(true);};
    readLink();window.addEventListener('hashchange',readLink);return()=>window.removeEventListener('hashchange',readLink);
  },[]);
  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();const fields=new FormData(e.currentTarget);setBusy(true);setError('');setMessage('');
    try{const j=await emailRequest(purpose==='verify'?'verify/confirm':token?'reset/confirm':'reset/request',
      {token,email:fields.get('email'),password:fields.get('password')});setMessage(j.message);
      if(token){setDone(true);window.history.replaceState(null,'',window.location.pathname);}
    }catch(e:any){setError(e.message);}finally{setBusy(false);}
  }
  return <main id="content" className="cec embedded"><section className="panel login" aria-label={purpose==='verify'?'Verify email':'Password recovery'}>
    <h1>{purpose==='verify'?'Verify your email':token?'Choose a new password':'Reset your password'}</h1>
    {error&&<p className="notice error" role="alert">{error}</p>}{message&&<p className="notice success" role="status">{message}</p>}
    {ready&&!done&&(purpose==='verify'&&!token?<p>This verification link is missing its token. Request a new email from your account settings.</p>:<form onSubmit={submit} className="form-grid">
      {purpose==='reset'&&(token?<label className="field">New password<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={256} required/></label>:<label className="field">Account email<input name="email" type="email" autoComplete="email" maxLength={254} required/></label>)}
      <p className="muted">{purpose==='verify'?'Confirm to verify this email address. Membership and university affiliation are managed separately.':token?'Changing your password signs out all existing sessions.':'If your email matches an account, we will queue a reset link.'}</p>
      <button className="button" disabled={busy}>{busy?'Working…':purpose==='verify'?'Verify email':token?'Change password':'Request reset link'}</button>
    </form>)}
    <p><a className="link" href="/clubs/cec/settings">Return to account</a></p>
  </section></main>;
}
