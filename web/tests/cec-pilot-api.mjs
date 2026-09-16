import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
const origin=process.env.CEC_TEST_ORIGIN, password='Pilot-test-'+randomUUID();
let checks=0;
async function req(path,body,cookie='',status=200) {
  const r=await fetch(origin+'/api/cec/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Origin:origin,Cookie:cookie},...(body?{body:JSON.stringify(body)}:{})});
  const data=await r.json();assert.equal(r.status,status,`${path}: ${JSON.stringify(data)}`);checks++;
  return {data,cookie:r.headers.get('set-cookie')?.split(';')[0]||''};
}
await req('health');
const officer=(await req('auth/setup',{name:'Pilot Officer',email:'pilot-officer@example.test',password,bootstrap:process.env.CEC_BOOTSTRAP_TOKEN})).cookie;
const officerId=(await req('state',null,officer)).data.user.id;
await req('invites/create',{role:'officer'},officer,400);
const code=(await req('invites/create',{label:'Pilot members',email_domain:'example.test',max_uses:2},officer)).data.code;
await req('invite/claim',{code,name:'Impersonator',email:'pilot-officer@example.test'},'',400);
const takeover=await req('invite/claim',{code,name:'Impersonator',email:'pilot-officer@example.test',password:'Wrong-existing-password'},'',401);
assert.equal(takeover.cookie,'');checks++;
const join={code,name:'Pilot Member',email:'pilot-member@example.test',password};
const member=(await req('invite/claim',join)).cookie;
const memberId=(await req('state',null,member)).data.user.id;
await req('invite/claim',join); // idempotent claim, does not consume another seat
let invite=(await req('invites/state',null,officer)).data.invites.find(i=>i.code===code);
assert.equal(invite.uses,1);checks++;
const second=(await req('invite/claim',{...join,name:'Second member',email:'second@example.test'})).cookie;
const secondId=(await req('state',null,second)).data.user.id;
await req('invite/claim',{...join,email:'overflow@example.test'},'',409);
assert.equal((await req('auth/login',{email:join.email,password})).cookie.startsWith('cec_session='),true);checks++;
await req('memberships/state',null,member,403);
async function memberships(cookie=officer){return (await req('memberships/state',null,cookie)).data.memberships;}
async function change(id,action,cookie=officer,status=200,extra={}){
  const rows=await memberships(cookie), target=rows.find(m=>m.user_id===id);
  const actor=(await req('state',null,cookie)).data.user.id;
  return req('memberships/change',{user_id:id,action,version:target.version,actor_version:rows.find(m=>m.user_id===actor).version,password,...extra},cookie,status);
}
await change(officerId,'remove',officer,409);
await change(officerId,'demote',officer,409);
await change(memberId,'promote',officer,403,{password:'Incorrect password'});
const stale=(await memberships()).find(m=>m.user_id===memberId).version;
await change(memberId,'promote');
await req('memberships/change',{user_id:memberId,action:'demote',version:stale,password},officer,409);
await change(memberId,'demote');
// The pilot workflow, through the same HTTP API used by the UI.
const task=(await req('create',{kind:'task',data:{title:'Pilot launch checklist',assignee:memberId,status:'assigned',due_at:'2026-12-01T17:00:00Z'}},officer)).data.id;
await req('task.status',{id:task,status:'accepted'},member);
async function taskState(cookie=member){return (await req('state',null,cookie)).data.items.find(r=>r.id===task);}
let t=await taskState();
await req('task.status',{id:task,status:'submitted',version:t.version},member,400);
await req('task.status',{id:task,status:'submitted',version:t.version,submission_note:'Prepared the first launch checklist.',artifact_url:'https://example.com/pilot-v1'},member);
t=await taskState();
await req('task.status',{id:task,status:'accepted',version:t.version,revision_note:'Add the launch owner and deadline.'},officer);
t=await taskState();
await req('task.status',{id:task,status:'submitted',version:t.version,submission_note:'Added owner and deadline.',artifact_url:'https://example.com/pilot-v2'},member);
t=await taskState();
await req('task.status',{id:task,status:'completed',version:t.version},officer);
t=await taskState();assert.equal(t.data.status,'completed');assert.deepEqual(t.data.work_history.map(x=>x.kind),['submission','revision','submission','approval']);checks+=2;
await change(secondId,'remove');
assert.equal((await req('state',null,second)).data.user,null);checks++;
await req('invite/claim',{...join,name:'Second member',email:'second@example.test'},'',403);
await change(secondId,'restore');
const restored=(await req('auth/login',{email:'second@example.test',password})).cookie;
assert.equal((await req('state',null,restored)).data.user.role,'member');checks++;
// Transfer both roles atomically; outgoing officer immediately loses officer actions.
await change(memberId,'transfer');
assert.equal((await req('state',null,officer)).data.user.role,'member');checks++;
await req('memberships/state',null,officer,403);
assert.equal((await req('state',null,member)).data.user.role,'officer');checks++;
await req('invites/revoke',{code},member);
await req('invite/claim',join,'',403);
// Concurrent claims cannot overbook a single-use invitation.
const single=(await req('invites/create',{email_domain:'example.test',max_uses:1},member)).data.code;
const race=await Promise.all(['race-a','race-b'].map(async email=>{
 const r=await fetch(origin+'/api/cec/invite/claim',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({code:single,name:'Race fixture',email:email+'@example.test',password})});return r.status;
}));assert.deepEqual(race.sort(),[200,409]);checks++;
const d=new DatabaseSync(process.env.CEC_DATABASE);
assert.equal(d.prepare("SELECT COUNT(*) n FROM memberships WHERE organization_id='cornell-ec' AND role='officer' AND status='active'").get().n,1);checks++;
assert.ok(d.prepare("SELECT COUNT(*) n FROM audit WHERE action='membership.transfer'").get().n);checks++;
d.close();
console.log(`${checks} pilot assertions passed: secure invites, membership lifecycle, leadership transfer, and task revision/approval.`);
