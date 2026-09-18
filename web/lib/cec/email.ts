import { createCipheriv, randomBytes } from 'node:crypto';
import { db, fail, hash, id, officer, password, throttle, tx, type User, type Item } from './db';
import { inviteInfo } from './invites';

/** Only explicit configuration enables mail; never derive security links from Host. */
export function emailConfig() {
  const mode = process.env.CEC_EMAIL_MODE || 'disabled';
  if (mode === 'disabled') return null;
  const key = process.env.CEC_EMAIL_KEY || '', from = process.env.CEC_EMAIL_FROM || '';
  let origin: URL;
  try { origin = new URL(process.env.CEC_ORIGIN || ''); } catch { fail('Email configuration is incomplete.', 503); }
  if (!['capture','resend'].includes(mode) || !/^[a-f0-9]{64}$/i.test(key) || !from || /[\r\n]/.test(from)
    || origin.origin !== process.env.CEC_ORIGIN || (mode === 'capture' && process.env.NODE_ENV === 'production')
    || (mode === 'resend' && (!process.env.RESEND_API_KEY || origin.protocol !== 'https:')))
    fail('Email configuration is incomplete.', 503);
  return { mode, key, from, origin: origin.origin };
}
function configured() { const c=emailConfig(); if(!c) fail('Email delivery is not configured yet.',503); return c; }
function address(value: unknown) {
  const email=String(value||'').trim().toLowerCase();
  if(email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Enter a valid email.');
  return email;
}
function enqueue(c: NonNullable<ReturnType<typeof emailConfig>>, values:{kind:string; userId?:string; object?:string; token?:string; to:string; subject:string; text:string; dedupe:string; expires:number}) {
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',Buffer.from(c.key,'hex'),iv);
  const encrypted=Buffer.concat([cipher.update(JSON.stringify({from:c.from,to:[values.to],subject:values.subject,text:values.text}),'utf8'),cipher.final()]);
  const payload=[iv,cipher.getAuthTag(),encrypted].map(b=>b.toString('base64url')).join('.');
  db().prepare(`INSERT OR IGNORE INTO email_jobs(id,dedupe,kind,user_id,object_id,token_hash,mode,payload,created,expires)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).run(id(),values.dedupe,values.kind,values.userId||null,values.object||'',values.token||null,c.mode,payload,Date.now(),values.expires);
}
function tokenEmail(userId:string,email:string,purpose:'verify'|'reset') {
  const c=configured(), raw=randomBytes(32).toString('hex'), digest=hash(raw), expires=Date.now()+(purpose==='reset'?30:1440)*60000;
  db().prepare('UPDATE email_tokens SET used=1 WHERE user_id=? AND purpose=?').run(userId,purpose);
  db().prepare('INSERT INTO email_tokens VALUES(?,?,?,?,?,0)').run(digest,userId,email,purpose,expires);
  const route=purpose==='reset'?'recover':'verify';
  enqueue(c,{kind:purpose,userId,token:digest,to:email,expires,dedupe:digest,
    subject:purpose==='reset'?'Reset your Club OS password':'Verify your Club OS email',
    text:`${purpose==='reset'?'Reset your password':'Verify your email address'} using this link:\n${c.origin}/${route}/cec#token=${raw}\n\nThis link expires in ${purpose==='reset'?'30 minutes':'24 hours'}. If you did not request it, ignore this email. Email verification does not verify university affiliation.`});
}
export function requestReset(b:any) {
  configured(); const email=address(b.email);
  throttle('email:reset:global',100); throttle('email:reset:'+hash(email),3);
  return tx(()=>{
    const account=db().prepare("SELECT id,email FROM accounts WHERE email=? AND EXISTS(SELECT 1 FROM memberships WHERE user_id=accounts.id AND organization_id='cornell-ec')").get(email) as any;
    if(account) tokenEmail(account.id,account.email,'reset');
    return {message:'If an account exists, a password reset email has been queued.'};
  });
}
export function consumeEmailToken(purpose:'verify'|'reset',b:any) {
  throttle('email:consume',200);
  if(!/^[a-f0-9]{64}$/.test(String(b.token||''))) fail('This link is invalid or expired. Request a new one.');
  const encoded=purpose==='reset'?password(String(b.password||'')):null;
  return tx(()=>{
    const t=db().prepare(`SELECT t.* FROM email_tokens t JOIN accounts a ON a.id=t.user_id AND a.email=t.email
      WHERE t.hash=? AND t.purpose=? AND t.used=0 AND t.expires>?`).get(hash(b.token),purpose,Date.now()) as any;
    if(!t) fail('This link is invalid or expired. Request a new one.');
    db().prepare('UPDATE email_tokens SET used=1 WHERE hash=?').run(t.hash);
    if(purpose==='reset') {
      db().prepare('UPDATE accounts SET password=? WHERE id=?').run(encoded,t.user_id);
      db().prepare('DELETE FROM sessions WHERE user_id=?').run(t.user_id);
      db().prepare("UPDATE email_tokens SET used=1 WHERE user_id=? AND purpose='reset'").run(t.user_id);
    }
    db().prepare(`INSERT INTO account_email(user_id,email,verified_at) VALUES(?,?,?) ON CONFLICT(user_id)
      DO UPDATE SET email=excluded.email,verified_at=excluded.verified_at`).run(t.user_id,t.email,new Date().toISOString());
    return {message:purpose==='reset'?'Password changed. Sign in with your new password.':'Email verified. Club membership is managed separately.'};
  });
}
export function emailState(u:User) {
  const c=emailConfig();
  const a=db().prepare('SELECT verified_at,task_notifications FROM account_email WHERE user_id=? AND email=?').get(u.id,u.email) as any;
  return {mode:c?.mode||'disabled',verified:!!a?.verified_at,taskNotifications:a?.task_notifications!==0,
    jobs:db().prepare('SELECT kind,status,created,error FROM email_jobs WHERE user_id=? ORDER BY created DESC LIMIT 10').all(u.id)};
}
export function emailAction(u:User,action:string,b:any) {
  if(action==='verify/request') {
    configured(); throttle('email:verify:'+u.id,3);
    return tx(()=>{tokenEmail(u.id,u.email,'verify');return {message:'Verification email queued.'};});
  }
  if(action==='preferences') {
    if(typeof b.taskNotifications!=='boolean') fail('Choose a notification preference.');
    db().prepare(`INSERT INTO account_email(user_id,email,task_notifications) VALUES(?,?,?) ON CONFLICT(user_id)
      DO UPDATE SET task_notifications=excluded.task_notifications`).run(u.id,u.email,Number(b.taskNotifications));
    return {message:'Email preference saved.'};
  }
  if(action==='invite') {
    officer(u); const c=configured(), to=address(b.email), info=inviteInfo(String(b.code||''));
    if(!info.valid) fail('This invitation is unavailable.');
    if(info.email_domain && !to.endsWith('@'+info.email_domain)) fail('The recipient must match the invitation email domain.');
    throttle('email:invite:'+u.id,30);
    return tx(()=>{enqueue(c,{kind:'invite',userId:u.id,object:info.code,to,subject:'You are invited to Club OS',
      text:`Join the Cornell Entrepreneurship Club workspace:\n${c.origin}/join/cec?i=${encodeURIComponent(info.code)}\n\nThis member invitation expires ${info.expires_at}. Sign in or create an account to join.`,
      dedupe:`invite:${info.code}:${hash(to)}`,expires:Math.min(Date.parse(info.expires_at),Date.now()+23*3600000)});
      return {message:'Invitation queued (duplicate requests do not send another email).'};});
  }
  fail('Unknown email action.',404);
}
/** Called inside the task transaction: queue failure rolls back the task change. */
export function queueTaskEmail(task:Item,kind:'assignment'|'revision') {
  const c=emailConfig(); if(!c) return;
  const a=db().prepare(`SELECT a.email FROM accounts a JOIN account_email e ON e.user_id=a.id AND e.email=a.email
    JOIN memberships m ON m.user_id=a.id AND m.organization_id='cornell-ec'
    WHERE a.id=? AND e.verified_at IS NOT NULL AND e.task_notifications=1 AND m.status='active' AND m.role IN('member','officer')`).get(task.data.assignee) as any;
  if(!a) return;
  enqueue(c,{kind,userId:task.data.assignee,object:task.id,to:a.email,subject:kind==='assignment'?'New Club OS task assignment':'Your Club OS task needs a revision',
    text:`${kind==='assignment'?'A task has been assigned to you.':'An officer requested a revision to your task.'}\nOpen the workspace to review it:\n${c.origin}/clubs/cec/workspace#task-${encodeURIComponent(task.id)}\n\nManage task emails in your Club OS account.`,
    dedupe:`${kind}:${task.id}:${task.version}`,expires:Date.now()+23*3600000});
}
