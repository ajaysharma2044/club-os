import assert from 'node:assert/strict';
import {commitAndRefresh,localDateTime,optionalNumber} from '../components/cec/frontendState.ts';
let writes=0, warnings=0;
assert.deepEqual(await commitAndRefresh(async()=>{writes++;return {id:'saved-record'}},async()=>{throw Error('offline')},()=>warnings++),{id:'saved-record'});
assert.equal(writes,1); assert.equal(warnings,1);
let refreshed=false;
await assert.rejects(commitAndRefresh(async()=>{throw Error('write rejected')},async()=>{refreshed=true},()=>warnings++),/write rejected/);
assert.equal(refreshed,false); assert.equal(warnings,1);
for(const timezone of ['America/Los_Angeles','America/New_York','UTC']) {
 process.env.TZ=timezone;
 for(const day of ['2026-03-07','2026-03-09','2026-11-01','2026-11-03']) {
  const local=new Date(day+'T19:00:00');const value=localDateTime(local);
  assert.equal(value,day+'T19:00');assert.equal(new Date(value).getTime(),local.getTime());
 }
}
assert.equal(optionalNumber('0'),0);assert.equal(optionalNumber(''),undefined);assert.equal(optionalNumber('60'),60);
console.log('Confirmed writes survive failed reads; rejected writes never refresh; timezone defaults and zero RSVP: PASS');
const {memberNavigation,currentNavigation,homeTasks}=await import('../lib/cec/navigation.ts');
assert.deepEqual(memberNavigation.map(i=>i.label),['Home','Events','Tasks & Projects','Inbox','People']);
assert.equal(currentNavigation('/clubs/cec/messages','/clubs/cec/messages'),true);
assert.equal(currentNavigation('/clubs/cec/workspace','/'),false);
assert.equal(currentNavigation('/clubs/cec','/'),true);
const task=(id,status,due_at,assignee='me')=>({id,kind:'task',data:{status,due_at,assignee}});
assert.deepEqual(homeTasks([task('late','accepted','2026-01-01'),task('done','completed','2025-01-01'),task('other','assigned','2025-01-01','else'),task('later','assigned','2027-01-01'),task('undated','assigned',undefined)],'me').map(t=>t.id),['late','later','undated']);
assert.equal(homeTasks([task('signed-out','assigned','2026-01-01')]).length,0);
console.log('Navigation destinations and personal next-task selection: PASS');
