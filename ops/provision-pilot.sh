#!/bin/sh
set -eu
# First deployment only. Never discovers/reuses another project's database or settings.
test "$(id -u)" = 0
test ! -e /etc/taskpilot/pilot.env
test -z "$(docker ps -aq --filter name='^taskpilot-db$')"
! ss -lnt | awk '{print $4}' | grep -Eq ':(8240|15488)$'
id taskpilot >/dev/null 2>&1 || useradd --system --home /var/lib/taskpilot --shell /usr/sbin/nologin taskpilot
install -d -o root -g taskpilot -m 750 /etc/taskpilot
install -d -o taskpilot -g taskpilot -m 750 /var/lib/taskpilot
install -d -o root -g root -m 700 /var/lib/taskpilot/backups
install -d -o root -g root -m 755 /opt/taskpilot/releases
node --input-type=module - <<'NODE'
import{randomBytes}from'node:crypto';import{writeFileSync,chmodSync}from'node:fs';
const secret=()=>randomBytes(32).toString('base64url');const db=secret();
for(const[name,value]of Object.entries({'api-token':secret(),'reauth-secret':secret(),'encryption-key':randomBytes(32).toString('base64'),'backup-key':randomBytes(32).toString('base64')}))writeFileSync('/etc/taskpilot/'+name,value+'\n',{mode:0o640});
writeFileSync('/etc/taskpilot/postgres.env',`POSTGRES_DB=taskpilot_pilot\nPOSTGRES_USER=taskpilot\nPOSTGRES_PASSWORD=${db}\n`,{mode:0o600});
writeFileSync('/etc/taskpilot/pilot.env',`NODE_ENV=production\nDATABASE_URL=postgresql://taskpilot:${db}@127.0.0.1:15488/taskpilot_pilot\nTASKPILOT_API_TOKEN_FILE=/etc/taskpilot/api-token\nTASKPILOT_REAUTH_SECRET_FILE=/etc/taskpilot/reauth-secret\nTASKPILOT_ENCRYPTION_KEY_FILE=/etc/taskpilot/encryption-key\nTASKPILOT_BIND_HOST=127.0.0.1\nTASKPILOT_BIND_PORT=8240\nTASKPILOT_MOCK_ENABLED=true\nWHATSAPP_SENDING_ENABLED=false\nAI_ENABLED=false\n`,{mode:0o640});
NODE
chown root:taskpilot /etc/taskpilot/api-token /etc/taskpilot/reauth-secret /etc/taskpilot/encryption-key /etc/taskpilot/pilot.env
chmod 600 /etc/taskpilot/backup-key
# Reuse only the installed upstream image, pin its digest. No package/daemon upgrades.
image=$(docker image inspect postgres:17-alpine --format '{{index .RepoDigests 0}}')
docker run -d --name taskpilot-db --restart unless-stopped --memory 384m --cpus 0.5 --pids-limit 128 \
 --security-opt no-new-privileges:true --env-file /etc/taskpilot/postgres.env \
 -p 127.0.0.1:15488:5432 -v taskpilot-pilot-postgres:/var/lib/postgresql/data "$image" >/dev/null
echo 'TaskPilot isolated pilot database created on loopback.'
