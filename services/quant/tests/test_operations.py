import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import operations

class OperationsTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.env=patch.dict(os.environ,{'RESTIC_REPOSITORY':'s3:https://example.test/club-backup','RESTIC_PASSWORD_FILE':'/test/secret'})
        self.env.start();self.addCleanup(self.env.stop)

    def test_health_codes_and_no_data_leak(self):
        now=1000000
        state={'worker_heartbeat':now,'last_backup':now,'pending':0,'exhausted':0,'private':'must not leak'}
        self.assertEqual(operations.issues(state,now,{'last_remote_backup':now},20,True),[])
        stale=operations.issues({},now,{},95,False)
        self.assertEqual(stale,['web_unavailable','worker_stale','local_backup_stale','offsite_backup_stale','disk_nearly_full'])
        self.assertNotIn('must not leak',str(stale))

    def test_offsite_retention_only_after_success(self):
        snapshots=self.root/'backups';snapshots.mkdir()
        for n in range(9):
            p=snapshots/f'backup-{n:03}';p.mkdir();(p/'cec.sqlite').write_bytes(b'synthetic snapshot')
            (p/'manifest.json').write_text(json.dumps({'version':1,'files':{'cec.sqlite':operations.digest(p/'cec.sqlite')}}))
        with patch.object(operations,'restic',side_effect=RuntimeError('unavailable')):
            with self.assertRaises(RuntimeError):operations.offsite_once(snapshots,self.root/'state')
        self.assertEqual(len(list(snapshots.iterdir())),9)
        with patch.object(operations,'restic') as run:
            operations.offsite_once(snapshots,self.root/'state')
            commands=[c.args[0] for c in run.call_args_list]
            self.assertEqual(commands[0][0],'backup')
            self.assertIn('--prune',commands[1]);self.assertIn('club-os',commands[1])
            self.assertEqual(commands[2],['check'])
        self.assertEqual(len(list(snapshots.iterdir())),7)
        self.assertGreater(operations.read_state(self.root/'state/offsite.json')['last_remote_backup'],0)
        newest=sorted(snapshots.iterdir())[-1];(newest/'cec.sqlite').write_bytes(b'corrupted')
        with patch.object(operations,'restic') as run:
            with self.assertRaises(ValueError):operations.offsite_once(snapshots,self.root/'state')
            run.assert_not_called()

    def test_monitor_deduplicates_and_reports_recovery(self):
        now=1000000
        operations.write_state(self.root/'offsite.json',{'last_remote_backup':now})
        healthy={'worker_heartbeat':now,'last_backup':now,'exhausted':0,'pending':0}
        def response(*args,**kwargs):
            stream=io.StringIO('{"ok":true}');stream.status=200;return stream
        disk=type('Disk',(),{'used':20,'total':100})()
        with patch.object(operations,'status',return_value=healthy),patch.object(operations.urllib.request,'urlopen',side_effect=response),patch.object(operations.shutil,'disk_usage',return_value=disk),patch.object(operations,'notify') as notify:
            operations.monitor_once(self.root/'cec.sqlite',self.root,now);notify.assert_not_called()
            healthy['exhausted']=1
            operations.monitor_once(self.root/'cec.sqlite',self.root,now+1)
            operations.monitor_once(self.root/'cec.sqlite',self.root,now+2)
            self.assertEqual(notify.call_count,1)
            healthy['exhausted']=0
            operations.monitor_once(self.root/'cec.sqlite',self.root,now+3)
            self.assertEqual(notify.call_count,2);self.assertEqual(notify.call_args.args[0],[])

    def test_configuration_fails_closed(self):
        with patch.dict(os.environ,{'RESTIC_REPOSITORY':'/same/disk'}):
            with self.assertRaises(ValueError):operations.require_remote()
        with patch.dict(os.environ,{'CEC_ALERT_WEBHOOK':'http://example.test'}):
            with self.assertRaises(ValueError):operations.notify(['worker_stale'])

if __name__=='__main__':unittest.main()
