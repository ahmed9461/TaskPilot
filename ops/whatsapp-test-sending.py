"""Root-only bounded acceptance gate; invoke via private SSH stdin, never prints env."""
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import time
import urllib.request


def main():
    if os.geteuid() != 0 or len(sys.argv) != 2 or sys.argv[1] not in ("on", "off"):
        raise RuntimeError()
    enable = sys.argv[1] == "on"
    path = Path("/etc/taskpilot/pilot.env")
    original = path.read_text(encoding="utf-8")
    lines = original.splitlines()
    if lines.count("WHATSAPP_CONNECTION_ENABLED=true") != 1:
        raise RuntimeError()
    flags = [s for s in lines if s.startswith("WHATSAPP_SENDING_ENABLED=")]
    if len(flags) != 1 or flags[0] not in (
        "WHATSAPP_SENDING_ENABLED=false", "WHATSAPP_SENDING_ENABLED=true"
    ):
        raise RuntimeError()
    if enable:
        if flags[0] != "WHATSAPP_SENDING_ENABLED=false":
            raise RuntimeError()
        sql = """SELECT json_build_object(
          'liveGroups',(SELECT count(*) FROM groups g JOIN whatsapp_sessions s ON s.id=g.session_id WHERE s.provider='baileys' AND g.enabled),
          'testGroups',(SELECT count(*) FROM groups g JOIN whatsapp_sessions s ON s.id=g.session_id JOIN task_types t ON t.id=g.task_type_id WHERE s.provider='baileys' AND g.enabled AND g.namespace='whatsapp-test-acceptance' AND g.period_key='pilot-receive-v1' AND t.code='owner-test-receive-v1'),
          'pendingLiveJobs',(SELECT count(*) FROM reply_jobs r JOIN whatsapp_sessions s ON s.id=r.session_id WHERE s.provider='baileys' AND r.status IN ('APPROVED','SENDING','UNKNOWN_DELIVERY')),
          'unrelatedLiveJobs',(SELECT count(*) FROM reply_jobs r JOIN whatsapp_sessions s ON s.id=r.session_id JOIN source_messages m ON m.id=r.source_message_id JOIN groups g ON g.id=m.group_id WHERE s.provider='baileys' AND g.namespace<>'whatsapp-test-acceptance'));
        """
        result = subprocess.run(
            ["docker", "exec", "-i", "taskpilot-db", "psql", "-U", "taskpilot", "-d", "taskpilot_pilot", "-At", "-v", "ON_ERROR_STOP=1"],
            input=sql, text=True, capture_output=True, check=True, timeout=15,
        )
        scope = json.loads(result.stdout.strip())
        if scope != dict(liveGroups=1, testGroups=1, pendingLiveJobs=0, unrelatedLiveJobs=0):
            raise RuntimeError()
        backup = path.with_name("pilot.env.before-test-send-" + str(time.time_ns()))
        fd = os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as file:
            file.write(original)
    value = "true" if enable else "false"
    updated = re.sub(
        r"^WHATSAPP_SENDING_ENABLED=(?:true|false)$",
        "WHATSAPP_SENDING_ENABLED=" + value,
        original,
        flags=re.MULTILINE,
    )
    changed = updated != original
    if changed:
        permissions = path.stat()
        temporary = path.with_name("pilot.env.test-send-" + str(os.getpid()))
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as file:
            file.write(updated)
            file.flush()
            os.fsync(file.fileno())
        os.chown(temporary, permissions.st_uid, permissions.st_gid)
        os.chmod(temporary, stat.S_IMODE(permissions.st_mode))
        os.replace(temporary, path)
        subprocess.run(["systemctl", "restart", "taskpilot.service"], check=True, timeout=30, capture_output=True)
    expected = json.loads(Path("/opt/taskpilot/current/package.json").read_text(encoding="utf-8"))["version"]
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen("http://127.0.0.1:8240/health", timeout=2) as response:
                health = json.load(response)
            if health.get("status") == "ok" and health.get("version") == expected:
                print(json.dumps(dict(testSending=enable, restarted=changed, health="PASS", testGroupOnly=True)))
                return
        except Exception:
            pass
        time.sleep(0.25)
    raise RuntimeError()


try:
    main()
except Exception:
    print("TEST_SENDING_GATE_FAILED", file=sys.stderr)
    sys.exit(1)
