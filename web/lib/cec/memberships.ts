import { db, tx, officer, text, fail, verify, timestamp, audit, emit, throttle, type User } from './db';

export function membershipState(u: User) {
  officer(u);
  return { memberships: db().prepare(`SELECT m.user_id,m.role,m.status,m.version,m.joined_at,m.left_at,a.name,a.email
    FROM memberships m JOIN accounts a ON a.id=m.user_id WHERE m.organization_id='cornell-ec' ORDER BY a.name`).all() };
}

export function changeMembership(u: User, b: any) {
  officer(u);
  throttle("membership-proof:"+u.id, 20);
  return tx(() => {
    officer(u);
    const account = db().prepare('SELECT password FROM accounts WHERE id=?').get(u.id) as any;
    if (!verify(text(b.password, 256), account.password)) fail('Your current password is incorrect.', 403);
    const targetId = text(b.user_id);
    const target = db().prepare("SELECT * FROM memberships WHERE organization_id='cornell-ec' AND user_id=?").get(targetId) as any;
    if (!target) fail('Membership not found.', 404);
    if (!Number.isInteger(b.version) || b.version !== target.version) fail('Membership changed. Refresh before continuing.', 409);
    const operation = text(b.action);
    if (!['promote','demote','remove','restore','transfer'].includes(operation)) fail('Unknown membership change.');
    let role = target.role, status = target.status;
    if (operation === 'promote' || operation === 'transfer') {
      if (status !== 'active' || role !== 'member') fail('Choose an active member.');
      role = 'officer';
    } else if (operation === 'demote') {
      if (status !== 'active' || role !== 'officer') fail('Choose an active officer.');
      role = 'member';
    } else if (operation === 'remove') {
      if (!['active','pending'].includes(status)) fail('Membership is already inactive.');
      status = 'left';
    } else {
      if (!['left','suspended'].includes(status)) fail('Only inactive memberships can be restored.');
      status = 'active'; role = 'member';
    }
    if (operation === 'transfer' && targetId === u.id) fail('Choose a different member.');
    if (target.role === 'officer' && target.status === 'active' && (role !== 'officer' || status !== 'active')) {
      const others = db().prepare("SELECT 1 FROM memberships WHERE organization_id='cornell-ec' AND role='officer' AND status='active' AND user_id!=?").get(targetId);
      if (!others) fail('Transfer leadership before removing the last officer.', 409);
    }
    db().prepare(`UPDATE memberships SET role=?,status=?,left_at=?,version=version+1
      WHERE organization_id='cornell-ec' AND user_id=?`).run(role,status,status==='left'?timestamp():null,targetId);
    if (operation === 'transfer') {
      const current = db().prepare("SELECT version FROM memberships WHERE organization_id='cornell-ec' AND user_id=?").get(u.id) as any;
      if (b.actor_version !== current.version) fail('Your membership changed. Refresh before transferring leadership.',409);
      // Promote first, demote second, in one transaction: there is always an officer.
      db().prepare("UPDATE memberships SET role='member',version=version+1 WHERE organization_id='cornell-ec' AND user_id=?").run(u.id);
      audit(u,'membership.transfer',targetId,{from:u.id,to:targetId});
      emit(u,'membership',u.id,'cornell-ec',{status:'active',role:'member'});
    }
    if (status === 'left') db().prepare('DELETE FROM sessions WHERE user_id=?').run(targetId);
    audit(u,'membership.'+operation,targetId,{before:{role:target.role,status:target.status},after:{role,status}});
    emit(u,'membership',targetId,'cornell-ec',{status:status==='active'?'active':'left',role});
    return {ok:true};
  });
}
