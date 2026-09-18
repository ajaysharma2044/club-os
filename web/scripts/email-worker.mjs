import { DatabaseSync } from 'node:sqlite';
import { createDecipheriv, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const hour=3600000;
/** A durable lease protects concurrent workers. Provider idempotency covers lease recovery. */
export async function deliverOnce({database=process.env.CEC_DATABASE||'.data/cec.sqlite',env=process.env,send=fetch,now=Date.now()}={}) {
  const mode=env.CEC_EMAIL_MODE||'disabled';
  if(mode==='disabled') return {status:'disabled'};
  if(!['capture','resend'].includes(mode)||!/^[a-f0-9]{64}$/i.test(env.CEC_EMAIL_KEY||'')
    ||(mode==='capture'&&env.NODE_ENV==='production')||(mode==='resend'&&!env.RESEND_API_KEY)) throw Error('Email worker configuration is incomplete');
  const d=new DatabaseSync(database);d.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON');
  let job, lease=randomUUID();
  try {
    d.exec('BEGIN IMMEDIATE');
    job=d.prepare(`SELECT * FROM email_jobs WHERE status='queued' AND next_attempt<=? OR status='processing' AND lease_until<=? ORDER BY created LIMIT 1`).get(now,now);
    if(!job) {d.exec('COMMIT');return {status:'idle'};}
    const finish=(status,error='')=>d.prepare("UPDATE email_jobs SET status=?,error=?,payload='',lease=NULL,lease_until=0 WHERE id=?").run(status,error,job.id);
    if(job.mode!==mode) {finish('cancelled','Delivery mode changed');d.exec('COMMIT');return {status:'cancelled'};}
    if(job.expires<=now || (job.first_attempt && now-job.first_attempt>=23*hour) || job.attempts>=8) {
      finish('failed','Delivery window expired; create a fresh request');d.exec('COMMIT');return {status:'failed'};
    }
    let valid=true;
    if(job.token_hash) valid=!!d.prepare(`SELECT 1 FROM email_tokens t JOIN accounts a ON a.id=t.user_id AND a.email=t.email WHERE t.hash=? AND t.used=0 AND t.expires>?`).get(job.token_hash,now);
    if(job.kind==='invite') valid=!!d.prepare(`SELECT 1 FROM invites i JOIN memberships m ON m.user_id=? AND m.organization_id='cornell-ec' WHERE i.code=? AND i.revoked=0 AND i.role='member' AND i.uses<i.max_uses AND i.expires_at>? AND m.status='active' AND m.role='officer'`).get(job.user_id,job.object_id,new Date(now).toISOString());
    if(['assignment','revision'].includes(job.kind)) valid=!!d.prepare(`SELECT 1 FROM accounts a JOIN account_email e ON e.user_id=a.id AND e.email=a.email JOIN memberships m ON m.user_id=a.id AND m.organization_id='cornell-ec' JOIN records r ON r.id=? AND r.organization_id='cornell-ec' WHERE a.id=? AND e.verified_at IS NOT NULL AND e.task_notifications=1 AND m.status='active' AND m.role IN('member','officer') AND json_extract(r.data,'$.assignee')=a.id AND json_extract(r.data,'$.status') NOT IN('completed','cancelled')`).get(job.object_id,job.user_id);
    if(!valid) {finish('cancelled','Request is no longer eligible');d.exec('COMMIT');return {status:'cancelled'};}
    d.prepare(`UPDATE email_jobs SET status='processing',attempts=attempts+1,first_attempt=COALESCE(first_attempt,?),lease=?,lease_until=? WHERE id=?`).run(now,lease,now+60000,job.id);
    d.exec('COMMIT');
    let payload;
    try {
      const [iv,tag,data]=job.payload.split('.').map(s=>Buffer.from(s,'base64url'));
      const decipher=createDecipheriv('aes-256-gcm',Buffer.from(env.CEC_EMAIL_KEY,'hex'),iv);decipher.setAuthTag(tag);
      payload=JSON.parse(Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8'));
    } catch {
      d.prepare("UPDATE email_jobs SET status='failed',error='Unable to decrypt queued email',lease=NULL WHERE id=? AND lease=?").run(job.id,lease);
      return {status:'failed'};
    }
    let status='accepted',error='',providerId='';
    if(mode==='capture') {
      try {
        const dir=resolve(env.CEC_EMAIL_CAPTURE_DIR||resolve(dirname(database),'mail'));
        mkdirSync(dir,{recursive:true,mode:0o700});
        writeFileSync(resolve(dir,job.id+'.json'),JSON.stringify(payload),{mode:0o600});status='captured';
      } catch {status='queued';error='Local capture failed';}
    } else {
      try {
        const response=await send('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'clubos/'+job.id},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
        if(response.ok) {const result=await response.json();if(!result.id) throw Error('Missing receipt');providerId=String(result.id);}
        else {status=[408,429].includes(response.status)||response.status>=500?'queued':'failed';
          if(response.status===409) {const result=await response.json();if(result.name==='concurrent_idempotent_requests')status='queued';}
          error='Provider HTTP '+response.status;}
      } catch {status='queued';error='Provider response unavailable';}
    }
    if(status==='queued'&&job.attempts+1>=8) {status='failed';error='Retry limit reached';}
    d.prepare(`UPDATE email_jobs SET status=?,error=?,provider_id=?,next_attempt=?,lease=NULL,lease_until=0,payload=CASE WHEN ?='queued' THEN payload ELSE '' END WHERE id=? AND lease=?`).run(status,error,providerId,now+Math.min(hour,30000*2**job.attempts),status,job.id,lease);
    return {status};
  } catch(error) {try{d.exec('ROLLBACK');}catch{} throw error;} finally {d.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  let stopped=false;process.on('SIGTERM',()=>{stopped=true;});process.on('SIGINT',()=>{stopped=true;});
  do {
    try {const result=await deliverOnce();if(process.argv[2]!=='work')console.log(JSON.stringify(result));
      if(process.argv[2]==='work'&&['idle','disabled'].includes(result.status))await new Promise(r=>setTimeout(r,5000));
    } catch {console.error('Email worker failed; check configuration and database availability.');if(process.argv[2]!=='work'){process.exitCode=1;break;}await new Promise(r=>setTimeout(r,5000));}
  } while(process.argv[2]==='work'&&!stopped);
}
