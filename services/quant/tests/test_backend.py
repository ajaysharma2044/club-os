import io
import json
import math
import tempfile
import unittest
from pathlib import Path
from club_quant.store import Store, Principal, Invalid, Denied
from club_quant.quant import forecast, evaluate, predictive
from club_quant.api import App

T1='2026-09-01T10:00:00Z'
T2='2026-09-02T10:00:00Z'
T3='2026-09-03T10:00:00Z'
T4='2026-09-04T10:00:00Z'
T5='2026-09-05T10:00:00Z'
T6='2026-09-06T10:00:00Z'

class RecordTests(unittest.TestCase):
    def setUp(self):
        self.time=T1
        self.store=Store(clock=lambda:self.time)
        self.p=Principal('cornell-ec','officer','officer',('native',))
        self.store.source(self.p,'native')
        self.i=0

    def tearDown(self):
        self.store.close()

    def add(self,kind,subject,obj,payload,at=None,**extra):
        self.i+=1
        data=dict(source='native',external_id=str(self.i),fact_key=f'{kind}:{subject}:{obj}',
                  kind=kind,subject=subject,object_id=obj,occurred_at=at or self.time,payload=payload)
        data.update(extra)
        return self.store.ingest(self.p,**data)

    def event(self,obj,start,status='published'):
        return self.add('event','cornell-ec',obj,dict(status=status,starts_at=start,title=obj))

    def test_idempotency_conflict(self):
        a=self.add('rsvp','a','e',{'status':'yes'},external_id='key')
        b=self.add('rsvp','a','e',{'status':'yes'},external_id='key')
        self.assertEqual(a['id'],b['id'])
        self.assertTrue(b['duplicate'])
        with self.assertRaises(Invalid):
            self.add('rsvp','a','e',{'status':'no'},external_id='key')

    def test_late_correction_preserves_past(self):
        a=self.add('rsvp','a','e',{'status':'yes'})
        self.time=T3
        self.add('rsvp','a','e',{'status':'no'},at=T1,supersedes=a['id'],reason='correct entry')
        self.assertEqual(self.store.snapshot(self.p,T2,T2)[0]['payload']['status'],'yes')
        self.assertEqual(self.store.snapshot(self.p,T2,T3)[0]['payload']['status'],'no')

    def test_backfill_does_not_replace_newer_valid_state(self):
        self.time=T3
        self.add('rsvp','a','e',{'status':'no'})
        self.time=T4
        self.add('rsvp','a','e',{'status':'yes'},at=T1)
        self.assertEqual(self.store.snapshot(self.p)[0]['payload']['status'],'no')

    def test_future_and_schema_rejected(self):
        with self.assertRaises(Invalid):
            self.add('rsvp','a','e',{'status':'yes'},at=T2)
        with self.assertRaises(Invalid):
            self.add('rsvp','a','e',{'status':'yes','message_content':'private'})
        with self.assertRaises(Invalid):
            self.add('rsvp','a','e',{'status':'yes'},at='2026-09-01T00:00:00')
        with self.assertRaises(Invalid):
            self.add('rsvp','a','e',{'status':'yes'},fact_key='duplicate')

    def test_source_and_tenant_isolation(self):
        self.add('rsvp','a','e',{'status':'yes'})
        other=Principal('another','o','officer',('native',))
        self.assertEqual(self.store.history(other),[])
        self.assertEqual(self.store.history(Principal('cornell-ec','r','researcher',())),[])
        with self.assertRaises(Denied):
            self.store.history(Principal('cornell-ec','vc','vc',('native',)))
        self.store.source(self.p,'native',enabled=False)
        self.assertEqual(self.store.history(self.p),[])
        with self.assertRaises(Denied):
            self.add('rsvp','b','e',{'status':'yes'})

    def test_correction_cannot_change_identity(self):
        a=self.add('rsvp','a','e',{'status':'yes'})
        with self.assertRaises(Invalid):
            self.add('rsvp','b','e',{'status':'no'},supersedes=a['id'],reason='oops')

    def setup_forecast(self):
        self.event('past',T2)
        for person in ('a','b','c'):
            self.add('rsvp',person,'past',{'status':'yes'})
        self.time=T3
        self.event('past',T2,'closed')
        self.add('attendance','a','past',{'status':'present','method':'officer'})
        self.add('attendance','b','past',{'status':'absent','method':'officer'})
        self.event('next',T5)
        for person in ('a','b'):
            self.add('rsvp',person,'next',{'status':'yes'})
        return forecast(self.store,self.p,'next')

    def test_missing_is_not_absent_and_beta_update(self):
        prediction=self.setup_forecast()
        self.assertEqual(prediction['features']['missing_labels'],1)
        self.assertEqual(prediction['posterior'],{'alpha':2.,'beta':2.,'mean_conversion':.5})
        self.assertEqual(prediction['forecast']['expected'],1)

    def test_late_labels_do_not_leak(self):
        self.setup_forecast()
        before=forecast(self.store,self.p,'next',T3,persist=False)
        self.time=T4
        self.add('attendance','c','past',{'status':'present','method':'officer'},at=T3)
        after=forecast(self.store,self.p,'next',T3,persist=False)
        self.assertEqual(before,after)
        self.assertEqual(forecast(self.store,self.p,'next',persist=False)['posterior']['alpha'],3)

    def test_revocation_blocks_stored_prediction(self):
        prediction=self.setup_forecast()
        self.store.source(self.p,'native',enabled=False)
        with self.assertRaises(Denied):
            self.store.prediction(self.p,prediction['id'])

    def test_evaluation_uses_frozen_cohort(self):
        prediction=self.setup_forecast()
        self.time=T6
        self.event('next',T5,'closed')
        self.add('attendance','a','next',{'status':'present','method':'qr'})
        self.assertEqual(evaluate(self.store,self.p,prediction['id'])['status'],'incomplete_labels')
        self.add('attendance','b','next',{'status':'absent','method':'officer'})
        self.add('rsvp','late','next',{'status':'yes'})
        result=evaluate(self.store,self.p,prediction['id'])
        self.assertEqual(result['n'],2)
        self.assertEqual(result['brier'],.25)
        self.assertEqual(result['absolute_error'],0)

    def test_erasure_invalidates_predictions_and_blocks_reimport(self):
        prediction=self.setup_forecast()
        self.store.erase_subject(self.p,'a')
        self.assertFalse(any(r['subject']=='a' for r in self.store.history(self.p)))
        with self.assertRaises(Invalid):
            self.store.prediction(self.p,prediction['id'])
        with self.assertRaises(Denied):
            self.add('rsvp','a','next',{'status':'yes'})

    def test_prior_only(self):
        self.event('new',T2)
        prediction=forecast(self.store,self.p,'new')
        self.assertEqual(prediction['status'],'prior_only')
        self.assertEqual(prediction['forecast']['interval_90'],[0,0])

class MathTests(unittest.TestCase):
    def test_uniform_prior_predictive(self):
        d=predictive(10,1,1)
        for p in d['probabilities']:
            self.assertAlmostEqual(p,1/11)
        self.assertAlmostEqual(d['expected'],5)

    def test_distribution_moments(self):
        n,a,b=50,13,4
        d=predictive(n,a,b)
        mean=sum(k*p for k,p in enumerate(d['probabilities']))
        variance=sum((k-mean)**2*p for k,p in enumerate(d['probabilities']))
        self.assertAlmostEqual(mean,n*a/(a+b))
        self.assertAlmostEqual(variance,n*a*b*(a+b+n)/((a+b)**2*(a+b+1)))
        self.assertAlmostEqual(sum(d['probabilities']),1)

    def test_bad_parameters(self):
        for args in [(-1,1,1),(2,0,1),(2,float('nan'),1),(True,1,1)]:
            with self.assertRaises(Invalid): predictive(*args)

class APITests(unittest.TestCase):
    def test_authenticated_round_trip_and_rejection(self):
        with tempfile.TemporaryDirectory() as folder:
            token='t'*40
            app=App(str(Path(folder)/'db'),{token:dict(club='cornell-ec',subject='o',role='officer',sources=['native'])})
            def call(path,body,auth=token):
                raw=json.dumps(body).encode()
                env=dict(REQUEST_METHOD='POST',PATH_INFO=path,CONTENT_LENGTH=str(len(raw)),HTTP_AUTHORIZATION='Bearer '+auth)
                env['wsgi.input']=io.BytesIO(raw)
                statuses=[]
                result=b''.join(app(env,lambda status,headers:statuses.append(status)))
                return statuses[0],json.loads(result)
            self.assertEqual(call('/v1/sources',{'source':'native'},'bad')[0],'403 Forbidden')
            self.assertEqual(call('/v1/sources',{'source':'native'})[0],'200 OK')
            status,result=call('/v1/records',dict(source='native',external_id='1',fact_key='rsvp:a:e',kind='rsvp',subject='a',object_id='e',occurred_at=T1,payload={'status':'yes'}))
            self.assertEqual(status,'201 Created')
            self.assertIn('id',result)
            self.assertEqual(call('/v1/sources',{'source':'native','enabled':'false'})[0],'400 Bad Request')
            self.assertEqual(call('/v1/records',{'club':'other'})[0],'400 Bad Request')

if __name__=='__main__':
    unittest.main()
