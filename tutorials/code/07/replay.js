// replay.js: run one prototype-06 recording through the real module, on the watch
var A = require("actcls");
var r = A.replay(require("Storage").open("log.20260101-1015", "r"));
var cm = A.confusion();
r.windows.forEach(function (w) { cm.add(r.label, w.cls); });
print(r.label, cm.m[r.label], (100 * cm.accuracy(r.label)).toFixed(0) + "%");
