"""Synthetic Cornell workflow; no real students, connections or business evidence."""
import json
from club_quant.store import Store, Principal
from club_quant.quant import forecast,evaluate
from club_quant.planning import simulate

clock=['2026-09-01T12:00:00Z']
store=Store(clock=lambda:clock[0])
p=Principal('cornell-ec','demo-officer','officer',('native',))
store.source(p,'native')
counter=0

def record(kind,subject,obj,payload):
    global counter
    counter+=1
    return store.ingest(p,source='native',external_id=str(counter),fact_key=f'{kind}:{subject}:{obj}',
                        kind=kind,subject=subject,object_id=obj,occurred_at=clock[0],payload=payload)

def event(ident,start,status):
    record('event',p.club,ident,dict(status=status,starts_at=start,title='Startup Hours (synthetic)'))

event('startup-1','2026-09-02T18:00:00Z','published')
for i in range(10):
    record('rsvp',f'demo-{i}','startup-1',dict(status='yes'))
clock[0]='2026-09-03T12:00:00Z'
event('startup-1','2026-09-02T18:00:00Z','closed')
for i in range(10):
    record('attendance',f'demo-{i}','startup-1',dict(status='present' if i<7 else 'absent',method='officer'))
event('startup-2','2026-09-05T18:00:00Z','published')
for i in range(12):
    record('rsvp',f'demo-{i}','startup-2',dict(status='yes'))
record('task','demo-1','publish-agenda',dict(status='assigned',title='Publish agenda',due_at='2026-09-04T18:00:00Z'))
record('application','demo-2','fall-recruitment',dict(status='submitted'))
record('coffee_chat','demo-2','chat-1',dict(status='booked',starts_at='2026-09-04T14:00:00Z'))
prediction=forecast(store,p,'startup-2')
clock[0]='2026-09-06T12:00:00Z'
event('startup-2','2026-09-05T18:00:00Z','closed')
for i in range(12):
    record('attendance',f'demo-{i}','startup-2',dict(status='present' if i<8 else 'absent',method='officer'))
print(json.dumps({'synthetic':True,'forecast':prediction,'evaluation':evaluate(store,p,prediction['id']),
 'project_scenario':simulate([dict(id='draft',dependencies=[],optimistic=1,likely=2,pessimistic=4),
 dict(id='review',dependencies=['draft'],optimistic=1,likely=1,pessimistic=3)],5,1000,42),
 'graph_edges':len(store.graph(p)['edges'])},indent=2))
store.close()
