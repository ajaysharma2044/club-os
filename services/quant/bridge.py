"""Trusted app subprocess bridge. Input comes from server code, never a browser token."""
import json,sys,os
from club_quant.store import Store,Principal
from club_quant.quant import forecast,evaluate
from club_quant.planning import simulate
request=json.load(sys.stdin)
store=Store(os.environ['CEC_QUANT_DATABASE'])
p=Principal('cornell-ec','app-service','officer',('native',))
store.source(p,'native')
try:
 if request['action']=='ingest':
  event=request['event']; actor=event.pop('_actor')
  result=store.ingest(Principal('cornell-ec',actor,'officer',('native',)),**event)
 elif request['action']=='forecast':result=forecast(store,p,request['event_id'])
 elif request['action']=='plan':result=simulate(**request['input'])
 elif request['action']=='evaluate':result=evaluate(store,p,request['prediction_id'])
 else:raise ValueError('Unknown action')
 print(json.dumps(result,allow_nan=False))
finally:store.close()
