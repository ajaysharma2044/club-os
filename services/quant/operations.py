"""Operational checks, encrypted off-machine backups, and data-free alert delivery."""
import argparse
import contextlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import urllib.request
from urllib.parse import urlparse
from pipeline import digest, status


def read_state(path):
    try:
        return json.loads(Path(path).read_text())
    except (OSError, ValueError):
        return {}


def write_state(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value))
    os.chmod(temporary, 0o600)
    temporary.replace(path)


def issues(state, now, remote, disk_percent, web_ok):
    result = []
    if not web_ok:
        result.append('web_unavailable')
    if now - float(state.get('worker_heartbeat', 0)) > 120:
        result.append('worker_stale')
    if now - float(state.get('last_backup', 0)) > 30 * 3600:
        result.append('local_backup_stale')
    if now - float(remote.get('last_remote_backup', 0)) > 30 * 3600:
        result.append('offsite_backup_stale')
    if state.get('exhausted', 0):
        result.append('delivery_exhausted')
    if state.get('pending', 0) > 100:
        result.append('delivery_backlog')
    if now - float(state.get('last_api_error', 0)) < 900:
        result.append('api_errors')
    if disk_percent >= 90:
        result.append('disk_nearly_full')
    return result


def notify(codes):
    url = os.environ.get('CEC_ALERT_WEBHOOK', '')
    if urlparse(url).scheme != 'https':
        raise ValueError('Configure an HTTPS alert webhook')
    # Codes are fixed strings. Never include names, email, source data or secrets.
    message = 'Club OS: ' + (', '.join(codes) if codes else 'operational checks recovered')
    request = urllib.request.Request(url, data=json.dumps({'text': message}).encode(),
                                     headers={'Content-Type':'application/json'}, method='POST')
    with urllib.request.urlopen(request, timeout=10) as response:
        if response.status >= 300:
            raise RuntimeError('Alert delivery failed')


def monitor_once(database, directory, now=None):
    now = time.time() if now is None else now
    directory = Path(directory)
    prior = read_state(directory / 'monitor.json')
    remote = read_state(directory / 'offsite.json')
    try:
        state = status(database)
    except Exception:
        state = {}
    try:
        with urllib.request.urlopen(os.environ.get('CEC_HEALTH_URL','http://web:3000/api/cec/health'), timeout=10) as response:
            web_ok = response.status == 200 and json.load(response).get('ok') is True
    except Exception:
        web_ok = False
    disk = shutil.disk_usage(Path(database).parent)
    codes = issues(state, now, remote, 100 * disk.used / disk.total, web_ok)
    changed = codes != prior.get('issues', [])
    if changed or (codes and now - prior.get('last_sent',0) >= 3600):
        notify(codes)
        prior['last_sent'] = now
    prior.update({'issues':codes,'checked_at':now})
    write_state(directory / 'monitor.json', prior)
    return codes


def restic(arguments):
    result = subprocess.run(['restic', *arguments], capture_output=True, timeout=1800)
    if result.returncode:
        # stderr can contain repository credentials/paths: do not echo it.
        raise RuntimeError('Encrypted backup command failed')
    return result


def require_remote():
    repository = os.environ.get('RESTIC_REPOSITORY','')
    allowed = repository.startswith(('s3:','sftp:','b2:','azure:','gs:','rest:https:'))
    if not allowed:
        raise ValueError('Configure an off-machine RESTIC_REPOSITORY')
    if not os.environ.get('RESTIC_PASSWORD_FILE'):
        raise ValueError('Configure RESTIC_PASSWORD_FILE')


def offsite_once(backups, directory):
    require_remote()
    backups = Path(backups)
    snapshots = sorted(p for p in backups.glob('backup-*') if p.is_dir() and (p/'manifest.json').is_file())
    if not snapshots:
        raise RuntimeError('No complete local snapshot available')
    newest = snapshots[-1]
    manifest = read_state(newest / 'manifest.json')
    files = manifest.get('files', {})
    if manifest.get('version') != 1 or 'cec.sqlite' not in files or set(files) - {'cec.sqlite','quant.sqlite'}:
        raise ValueError('Invalid snapshot manifest')
    if any(digest(newest / name) != checksum for name, checksum in files.items()):
        raise ValueError('Snapshot checksum mismatch')
    # Only complete published snapshots, never live WAL/database files.
    restic(['backup', str(newest), '--host','club-os','--tag','club-os','--json'])
    # Apply retention only to this application's tagged backup set.
    restic(['forget','--host','club-os','--tag','club-os','--group-by','host,tags',
            '--keep-daily','7','--keep-weekly','4','--keep-monthly','3','--prune'])
    state = read_state(Path(directory)/'offsite.json')
    if time.time() - state.get('last_check',0) > 7 * 86400:
        restic(['check'])
        state['last_check'] = time.time()
    state.update({'last_remote_backup':time.time(),'snapshot':newest.name})
    write_state(Path(directory)/'offsite.json',state)
    # Local copies are pruned only after successful remote backup/retention/check.
    for old in snapshots[:-7]:
        shutil.rmtree(old)


def health(mode, database, directory):
    now=time.time()
    if mode=='worker':
        return now-float(status(database).get('worker_heartbeat',0)) < 120
    state=read_state(Path(directory)/('offsite.json' if mode=='offsite' else 'monitor.json'))
    return now-float(state.get('last_remote_backup' if mode=='offsite' else 'checked_at',0)) < (30*3600 if mode=='offsite' else 180)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command',choices=['monitor','offsite','init-repository','health','test-alert'])
    parser.add_argument('--once',action='store_true')
    parser.add_argument('--mode',choices=['worker','monitor','offsite'],default='worker')
    parser.add_argument('--database',default=os.environ.get('CEC_DATABASE','/data/cec.sqlite'))
    parser.add_argument('--backups',default=os.environ.get('CEC_BACKUP_DIR','/backups'))
    parser.add_argument('--state',default=os.environ.get('CEC_OPERATIONS_DIR','/ops'))
    args=parser.parse_args()
    os.umask(0o077)
    if args.command=='test-alert':
        notify(['deployment_test']); return
    if args.command=='health':
        try: good=health(args.mode,args.database,args.state)
        except Exception: good=False
        sys.exit(0 if good else 1)
    if args.command=='init-repository':
        require_remote(); restic(['init']); return
    while True:
        try:
            if args.command=='monitor': monitor_once(args.database,args.state)
            else: offsite_once(args.backups,args.state)
        except Exception:
            print('Operational cycle failed; inspect configuration and service health.',file=sys.stderr,flush=True)
            if args.once: sys.exit(1)
        if args.once: break
        time.sleep(60 if args.command=='monitor' else 3600)


if __name__=='__main__':
    main()
