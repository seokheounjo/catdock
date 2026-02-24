#!/bin/bash
cd /c/Users/jsh/virtual-company
ELECTRON_ENABLE_LOGGING=1 npx electron out/main/index.js > /tmp/electron-all.log 2>&1 &
PID=$!
sleep 35
echo "=== Process check ==="
tasklist | grep -i electron
echo "=== Log output ==="
cat /tmp/electron-all.log
kill $PID 2>/dev/null
