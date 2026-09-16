import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';

const d = new DatabaseSync(process.env.CEC_DATABASE);
d.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
const origin = process.env.CEC_TEST_ORIGIN;
const org = randomUUID(), other = randomUUID(), dual = randomUUID(), officer = randomUUID();
d.prepare("INSERT INTO organizations(id,slug,name,status) VALUES(?,?,?,'active')").run(org,org,'Synthetic second club');
for (const [id,role] of [[dual,'member'],[officer,'officer']]) d.prepare(
  "INSERT INTO users(id,name,email,password,role) VALUES(?,?,?,'unusable',?)").run(id,'Synthetic CEC user',id+'@example.test',role);
d.prepare("INSERT INTO accounts(id,name,email,password) VALUES(?,?,?,'unusable')").run(other,'Other club officer',other+'@example.test');
for (const id of [other,dual]) d.prepare("INSERT INTO memberships(organization_id,user_id,role,status) VALUES(?,?,'officer','active')").run(org,id);
const project = randomUUID(), task = randomUUID();
for (const [id,kind,data] of [[project,'project',{title:'Other club private project'}],
  [task,'task',{title:'Other club private task',assignee:other,project_id:project,status:'assigned'}]])
  d.prepare('INSERT INTO records(id,kind,owner,data,created_at,updated_at,organization_id) VALUES(?,?,?,?,?,?,?)')
    .run(id,kind,other,JSON.stringify(data),new Date().toISOString(),new Date().toISOString(),org);
function cookie(id) {
  const token = randomUUID();
  d.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)')
    .run(createHash('sha256').update(token).digest('hex'),id,Date.now()+60000);
  return 'cec_session='+token;
}
const aCookie=cookie(officer), bCookie=cookie(other), dualCookie=cookie(dual);
async function request(path,cookie,body) {
  const response=await fetch(origin+'/api/cec/'+path,{method:body?'POST':'GET',
    headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},
    ...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,body:await response.json()};
}
let response=await request('state',aCookie);
assert.equal(response.status,200);
assert.equal(response.body.items.some(r=>r.id===task || r.id===project),false);
assert.equal(response.body.people.some(p=>p.id===other),false);
assert.equal((await request('state',dualCookie)).body.user.role,'member');
assert.equal((await request('state',bCookie)).body.user,null);
assert.equal((await request('export',bCookie)).status,401);
assert.equal((await request('task.status',aCookie,{id:task,status:'cancelled'})).status,404);
assert.equal((await request('update',aCookie,{id:project,version:1,data:{title:'Stolen'}})).status,404);
assert.equal((await request('create',dualCookie,{kind:'event',data:{}})).status,403);
assert.equal((await request('create',bCookie,{kind:'project',data:{}})).status,401);
assert.equal((await request('create',aCookie,{organization_id:org,kind:'project',data:{}})).status,403);
assert.equal(JSON.parse(d.prepare('SELECT data FROM records WHERE id=?').get(task).data).status,'assigned');
d.prepare("UPDATE memberships SET status='suspended' WHERE user_id=? AND organization_id='cornell-ec'").run(officer);
assert.equal((await request('task.status',aCookie,{id:task,status:'cancelled'})).status,401);
d.close();
console.log('12 HTTP organization-boundary checks passed.');
