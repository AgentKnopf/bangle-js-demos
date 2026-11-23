#!/bin/sh
# Regenerates the step screenshots of tutorial 07 from the checkpoint files.
# Run from the repo root: sh tutorials/code/07/make-shots.sh [only-this-prefix]
set -e
ONLY=$1
D=tutorials/code/07
IMG=tutorials/img/07
b64() { base64 -w0 "$1"; }
# shot <checkpoint> <png> <steps...>: load the checkpoint as act.app.js with
# the fake accelerometer, then run the remaining screenshot.js steps
shot() {
  cp=$1; png=$2; shift 2
  case "$png" in "${ONLY}"*) ;; *) return 0 ;; esac
  node tools/screenshot.js actcls \
    --js "require('Storage').write('act.app.js',atob('$(b64 $D/$cp)'))" \
    --js "require('Storage').write('fake.js',atob('$(b64 $D/fake.js)'))" \
    --load act.app.js --js "eval(require('Storage').read('fake.js'))" \
    "$@" --shot "$IMG/$png"
}
shot step1.app.js step1-signal.png --js 'fake("walk")' --wait 10000
shot step2.app.js step2-features.png --js 'fake("walk")' --wait 10000
shot step3.app.js step3-walk.png --js 'fake("walk")' --wait 10000 --js 'print("CHK3", cls, JSON.stringify(f))'
shot step3.app.js step3-typing.png --js 'fake("type")' --wait 10000 --js 'print("CHK3", cls, JSON.stringify(f))'
shot step4.app.js step4-debounce.png --js 'fake("still")' --wait 60000 --js 'fake("walk")' --wait 2100 --js 'print("CHK4", shown, JSON.stringify(c), hist.slice(-4).join())'
shot step5.app.js step5-restless.png --js 'fake("walk")' --wait 180000 --js 'fake("still")' --wait 120000 --js 'fake("fidget")' --wait 60000 --js 'print("CHK5", shown, restlessness(), JSON.stringify(sum))'
shot step5.app.js step5-summary.png --js 'fake("walk")' --wait 180000 --js 'fake("still")' --wait 120000 --js 'fake("fidget")' --wait 60000 --swipe 150,90,30,90 --js 'print("CHK5S", page, JSON.stringify(require("Storage").readJSON("act.json")))'

# Step 6 has no screen output: copy a fixture to the watch as a StorageFile
# (in chunks, one console line each) and run replay.js; it prints to the console.
case "replay" in "${ONLY}"*)
  F=apps/actcls/tests/fixtures/log.20260101-1015
  T=$(mktemp -d)
  split -b 3000 $F $T/p
  set --
  for p in $T/p*; do set -- "$@" --js "require('Storage').open('log.20260101-1015','a').write(atob('$(b64 $p)'))"; done
  rm -r $T
  node tools/screenshot.js actcls "$@" \
    --js "require('Storage').write('replay.js',atob('$(b64 $D/replay.js)'))" \
    --js "eval(require('Storage').read('replay.js'))" --wait 1000 | tail -1
  ;;
esac
