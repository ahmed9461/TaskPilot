"""Explicit TaskPilot-only receive outage; always attempts own service recovery."""
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import urllib.request

def resume_on_signal(_number, _frame):
    raise SystemExit(1)

try:
    if os.geteuid()!=0 or sys.argv[1:]!=['--receive-outage-test']:
        raise RuntimeError()
    env=dict(l.split('=',1) for l in Path('/etc/taskpilot/pilot.env').read_text().splitlines() if '=' in l)
    if env.get('WHATSAPP_SENDING_ENABLED')!='false' or env.get('WHATSAPP_CONNECTION_ENABLED')!='true':
        raise RuntimeError()
    sql="SELECT count(*) FROM groups g JOIN whatsapp_sessions s ON s.id=g.session_id WHERE g.enabled AND s.provider='baileys';SELECT count(*) FROM reply_jobs r JOIN whatsapp_sessions s ON s.id=r.session_id WHERE s.provider='baileys' AND r.status IN ('APPROVED','SENDING','UNKNOWN_DELIVERY');"
    data=subprocess.run(['docker','exec','-i','taskpilot-db','psql','-U','taskpilot','-d','taskpilot_pilot','-At'],input=sql,text=True,capture_output=True,check=True).stdout.strip().splitlines()
    if data!=['1','0']:raise RuntimeError()
    for sig in (signal.SIGHUP,signal.SIGTERM,signal.SIGINT):signal.signal(sig,resume_on_signal)
    try:
        subprocess.run(['systemctl','stop','taskpilot.service'],check=True,capture_output=True,timeout=30)
        print(json.dumps({'outage':'STARTED','seconds':45,'scope':'taskpilot.service only','sendingEnabled':False}),flush=True)
        time.sleep(45)
    finally:
        subprocess.run(['systemctl','start','taskpilot.service'],check=True,capture_output=True,timeout=30)
    deadline=time.monotonic()+30
    while time.monotonic()<deadline:
        try:
            with urllib.request.urlopen('http://127.0.0.1:8240/health',timeout=2) as response:health=json.load(response)
            if health.get('status')=='ok':
                print(json.dumps({'outage':'RESUMED','health':'PASS','providerContinuity':'VERIFY_SEPARATELY'}));break
        except Exception:pass
        time.sleep(.25)
    else:raise RuntimeError()
except BaseException:
    print('OWN_OUTAGE_TEST_FAILED',file=sys.stderr)
    sys.exit(1)
