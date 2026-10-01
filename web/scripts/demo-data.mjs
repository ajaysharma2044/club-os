import {randomBytes} from 'node:crypto';
import {db, tx, user, audit, item, entity, createItem, publishRecord, emit} from '../lib/cec/db.ts';
import {auth, mutate} from '../lib/cec/service.ts';
import {captureItem} from '../lib/cec/evidence.ts';
import {offer} from '../lib/cec/opportunities.ts';
import {createGroup, postMessage} from '../lib/cec/messaging/conversations.ts';

export const batch = 'demo-september-2026-v1';
// The outer request takes the PostgreSQL advisory lock; the transaction makes
// the marker and all domain writes atomic. Replay never resets user test work.
export async function seedDemo(password) {
  if (process.env.CEC_EMAIL_MODE !== 'disabled') throw Error('Demo seeding requires disabled email.');
  return tx(async () => {
    const prior = await db().prepare("SELECT details FROM audit WHERE action='demo.seeded' AND object_id=?").get(batch);
    if (prior) return {...JSON.parse(prior.details), replayed:true};
    const members = [];
    for (const [key,name] of [['tester','Demo Tester'],['maya','Demo Maya'],['leo','Demo Leo']]) {
      const email = `${key}@demo.club-os.example.test`;
      if (await db().prepare('SELECT 1 FROM accounts WHERE email=?').get(email)) throw Error('Demo address already exists without its batch marker; refusing to reuse it.');
      const login = await auth('register',{name,email,password:key==='tester'?password:randomBytes(24).toString('base64url')});
      const account = await user(login.token);
      await mutate(account,'apply',{track:'Generalist',statement:'Synthetic demo account for user-requested product testing. Not a real club member.',url:''});
      // Explicit operator seed, scoped only to the account created above.
      await db().prepare("UPDATE users SET role='member' WHERE id=? AND role='applicant'").run(account.id);
      await db().prepare("UPDATE applications SET stage='accepted',review='Synthetic demo membership' WHERE user_id=?").run(account.id);
      await audit(account,'demo.membership',account.id,{batch,role:'member'});
      await emit(account,'membership',account.id,'cornell-ec',{status:'active',role:'member'});
      await db().prepare('DELETE FROM sessions WHERE user_id=?').run(account.id);
      members.push({...account,role:'member'});
    }
    const [tester,maya,leo] = members;
    const ids = [];
    // Trusted CLI writes use the same validators, history and outbox helpers.
    // This is not an HTTP endpoint and does not grant anyone an officer role.
    const create = async (actor,kind,input) => {
      const data=await entity(actor,kind,input);
      const r=await createItem(actor,kind,data);
      const source=await audit(actor,kind+'.create',r.id,{batch,version:r.version,state:r.data});
      await captureItem(actor,r,source);
      if(kind==='task') await offer(actor,{kind:'task',objectType:'task',objectId:r.id,to:data.assignee});
      await publishRecord(actor,r);ids.push(r.id);return r.id;
    };
    const at = (days,hour=22) => {const date=new Date();date.setUTCDate(date.getUTCDate()+days);date.setUTCHours(hour,0,0,0);return date.toISOString();};
    const events=[];
    for (const [title,days,capacity] of [['Startup idea exchange',2,25],['Pitch practice — waitlist demo',4,1],['Build night',7,40]]) {
      events.push(await create(tester,'event',{title:`[Demo] ${title}`,description:'Sample event for testing RSVP and calendar features. This is not a real scheduled club event.',location:'Demo room — no reservation',starts_at:at(days),ends_at:at(days,23),capacity,status:'published'}));
    }
    await mutate(maya,'rsvp',{event_id:events[1],status:'yes'});
    await mutate(leo,'rsvp',{event_id:events[0],status:'yes'});
    const project = await create(tester,'project',{title:'[Demo] Campus project board',description:'Synthetic project: explore a place for students to find collaborators. Try editing the description or stage.',stage:'building',url:'',shared:false});
    await create(maya,'project',{title:'[Demo] Reusable event checklist',description:'Synthetic idea for organizing club events.',stage:'idea',url:'',shared:false});
    for (const [title,days,status] of [['Draft the build-night checklist',1,'assigned'],['Collect three project ideas',3,'accepted'],['Review the sample event brief',5,'submitted']]) {
      const id=await create(tester,'task',{title:`[Demo] ${title}`,assignee:tester.id,due_at:at(days),status:'assigned',project_id:project,origin:'Synthetic demo batch'});
      if(status!=='assigned') await mutate(tester,'task.status',{id,status:'accepted'});
      if(status==='submitted') await mutate(tester,'task.status',{id,status,version:(await item(id)).version,submission_note:'Demo submission: the sample brief is ready for review.',artifact_url:''});
    }
    await create(tester,'doc',{title:'[Demo] Testing checklist',category:'Resource',url:'https://example.com',description:'Sample link only. Try accepting a task, submitting a note, RSVPing to an event, joining the full-event waitlist, and replying in the demo group.'});
    const group=await createGroup(tester,'[Demo] Build night planning',[maya.id,leo.id]);
    await postMessage(maya,group.id,'This is a synthetic demo conversation. Try replying here; no messages go to real members.');
    await postMessage(leo,group.id,'The sample checklist task is ready to try. All events and projects marked [Demo] are test records.');
    const result={batch,created_at:new Date().toISOString(),accounts:members.map(m=>m.id),items:ids,counts:{members:3,events:3,projects:2,tasks:3,documents:1,conversations:1}};
    // Private conversation content and membership stay out of the audit manifest.
    await audit(tester,'demo.seeded',batch,result);
    return result;
  });
}
