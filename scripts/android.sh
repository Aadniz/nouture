#!/usr/bin/env bash
# Developing on Android: used by the VS Code tasks and the npm scripts.
#
#   android.sh dev       start Vite + install a live-reload build; Ctrl+C restores the normal app
#   android.sh live      install a live-reload build (UI from Vite on this PC; needs Vite running)
#   android.sh install   build + install the normal, self-contained app
#   android.sh devtools  forward the app's WebView debugger to localhost:9222
#   android.sh logcat    follow the app's log, also across app restarts
#   android.sh mirror    show and control the device's screen (scrcpy)
set -euo pipefail

APP=com.nouture.app
VITE_PORT=3113
DEVTOOLS_PORT=9222

root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"

# native-run (used by `cap run`) needs the SDK location; Gradle reads local.properties
if [ -z "${ANDROID_HOME:-}" ] && [ -f android/local.properties ]; then
  ANDROID_HOME=$(sed -n 's/^sdk\.dir=//p' android/local.properties)
  export ANDROID_HOME
  export PATH="$ANDROID_HOME/platform-tools:$PATH"
fi

# The first connected device (e.g. an Android device over wireless adb)
serial() {
  local s
  s=$(adb devices | awk 'NR > 1 && $2 == "device" { print $1; exit }')
  if [ -z "$s" ]; then
    echo "No Android device connected: check 'adb devices' (wireless debugging may need re-pairing)" >&2
    exit 1
  fi
  echo "$s"
}

vite_running() {
  curl -sf -o /dev/null "http://localhost:$VITE_PORT/"
}

# The app's process id, waiting up to $1 seconds for it to start
app_pid() {
  local pid
  for _ in $(seq "$((${1:-60} * 2))"); do
    pid=$(adb -s "$SERIAL" shell pidof -s "$APP" 2>/dev/null | tr -d '\r' || true)
    [ -n "$pid" ] && { echo "$pid"; return; }
    sleep 0.5
  done
  echo "$APP isn't running" >&2
  exit 1
}

case "${1:-}" in
  dev)
    SERIAL=$(serial)
    if vite_running; then
      echo "Vite already runs on port $VITE_PORT"
      exec "$0" live
    fi
    # Its own process group, so Ctrl+C here can stop all of Vite
    setsid npm start &
    vite_pid=$!
    for _ in $(seq 60); do
      vite_running && break
      kill -0 "$vite_pid" 2>/dev/null || { echo "Vite didn't start" >&2; exit 1; }
      sleep 0.5
    done
    restore() {
      trap - INT TERM
      kill -TERM -- "-$vite_pid" 2>/dev/null || true
      echo
      echo "Reinstalling the normal app, so it works without this PC..."
      "$0" install
      exit 0
    }
    trap restore INT TERM
    "$0" live || { kill -TERM -- "-$vite_pid" 2>/dev/null; exit 1; }
    echo
    echo "Live reload is on: saved changes show up on the device."
    echo "Ctrl+C stops Vite and reinstalls the normal app."
    wait "$vite_pid" || true
    restore
    ;;

  live)
    SERIAL=$(serial)
    if ! vite_running; then
      echo "Vite isn't running on port $VITE_PORT, so a live-reload build couldn't load." >&2
      echo "Run 'npm run dev:android' to start Vite." >&2
      exit 1
    fi
    # The app loads its UI from http://localhost:3113 on the device, which adb
    # forwards to Vite here: saved changes show up right away. Kotlin changes
    # need this to run again (it rebuilds the native app too).
    #
    # Once the app runs, `cap run` only waits for Ctrl+C to revert its copy of
    # capacitor.config.json; send that ourselves so this step finishes.
    #
    # Build first: the APK still bundles dist/, which has the page shown when
    # Vite can't be reached (live-reload-error.html)
    npm run build
    coproc CAP {
      exec setsid npx cap run android --target "$SERIAL" \
        --live-reload --host localhost --port "$VITE_PORT" \
        --forwardPorts "$VITE_PORT:$VITE_PORT" 2>&1
    }
    cap_pid=$CAP_PID
    running=false
    while IFS= read -r line <&"${CAP[0]}"; do
      printf '%s\n' "$line"
      if [[ $line == *"App running with live reload"* ]]; then
        running=true
        kill -INT -- "-$cap_pid" 2>/dev/null || true
      fi
    done
    status=0
    wait "$cap_pid" || status=$?
    # Our Ctrl+C makes it exit with 130; that's success once the app runs
    $running || exit "$status"
    ;;

  install)
    SERIAL=$(serial)
    # The UI is bundled again, so the app works without this PC
    npm run build
    npx cap run android --target "$SERIAL"
    ;;

  devtools)
    SERIAL=$(serial)
    pid=$(app_pid 60)
    socket="webview_devtools_remote_$pid"
    for _ in $(seq 60); do
      adb -s "$SERIAL" shell grep -q "$socket" /proc/net/unix && break
      sleep 0.5
    done
    adb -s "$SERIAL" forward "tcp:$DEVTOOLS_PORT" "localabstract:$socket" >/dev/null
    for _ in $(seq 20); do
      curl -sf "http://localhost:$DEVTOOLS_PORT/json/version" >/dev/null && break
      sleep 0.5
    done
    echo "WebView debugger of $APP (pid $pid) on localhost:$DEVTOOLS_PORT"
    ;;

  logcat)
    SERIAL=$(serial)
    echo "Following the log of $APP (Ctrl+C to stop)"
    while true; do
      pid=$(app_pid 3600)
      echo "--- $APP started (pid $pid)"
      # Ends when the app exits; then wait for the next start
      adb -s "$SERIAL" logcat -v color -v time --pid="$pid" || true
      sleep 1
    done
    ;;

  mirror)
    SERIAL=$(serial)
    if ! command -v scrcpy >/dev/null; then
      echo "scrcpy isn't installed: sudo apt install scrcpy" >&2
      exit 1
    fi
    exec scrcpy -s "$SERIAL" --stay-awake --window-title "Pixel (Nouture)"
    ;;

  *)
    sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
