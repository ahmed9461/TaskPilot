#!/bin/sh
set -eu
release=${1:?full commit SHA required}
case "$release" in *[!a-f0-9]*|'') exit 2;; esac
test ${#release} = 40
test -d "/opt/taskpilot/releases/$release"
test -f /etc/taskpilot/pilot.env
cd "/opt/taskpilot/releases/$release"
npm ci --no-audit
npm run build
set -a
. /etc/taskpilot/pilot.env
set +a
node dist/services/api/src/migrate.js
npm prune --omit=dev --no-audit
chown -R root:root "/opt/taskpilot/releases/$release"
chmod -R go-w "/opt/taskpilot/releases/$release"
install -o root -g root -m 644 ops/taskpilot.service /etc/systemd/system/taskpilot.service
ln -s "/opt/taskpilot/releases/$release" /opt/taskpilot/next
mv -Tf /opt/taskpilot/next /opt/taskpilot/current
systemctl daemon-reload
systemctl enable --now taskpilot.service
systemctl restart taskpilot.service
echo 'TaskPilot pilot unit deployed. Run authenticated smoke tests.'
