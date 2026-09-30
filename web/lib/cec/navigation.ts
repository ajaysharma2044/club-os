/** Shared labels and destinations for the connected club, not demo clubs. */
export const memberNavigation = [
  {href: '/', label: 'Home'},
  {href: '/clubs/cec/events', label: 'Events'},
  {href: '/clubs/cec/workspace', label: 'Tasks & Projects'},
  {href: '/clubs/cec/messages', label: 'Inbox'},
  {href: '/clubs/cec/people', label: 'People'},
];
export const managementNavigation = [
  {href: '/clubs/cec/operations', label: 'Club operations', description: 'Review work, import records, prepare meetings and handoffs.'},
  {href: '/clubs/cec/people', label: 'Membership & applications', description: 'Invite members and review applications.'},
  {href: '/clubs/cec/money', label: 'Money & sponsors', description: 'Track finances, sponsorships and follow-ups.'},
  {href: '/clubs/cec/integrations', label: 'Integrations', description: 'Review connections and setup requirements.'},
  {href: '/clubs/cec/planning', label: 'Event planning', description: 'Compare possible times for club events.'},
];
export function currentNavigation(path: string, href: string) {
  if (href === '/') return path === '/' || path === '/clubs/cec';
  if (href === '/clubs/cec/messages' && path === '/chat') return true;
  return path === href || path.startsWith(href + '/');
}
export function homeTasks(items: any[], userId?: string) {
  if (!userId) return [];
  return items.filter(r => r.kind === 'task' && r.data.assignee === userId && !['completed','cancelled','approved','closed'].includes(r.data.status))
    .sort((a,b) => (Date.parse(a.data.due_at) || Infinity) - (Date.parse(b.data.due_at) || Infinity));
}
