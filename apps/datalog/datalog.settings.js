// Settings > Apps > Data logger: choose which labels the app offers.
(function (back) {
  var ST = require("Storage"), D = require("datalog");
  var s = ST.readJSON("datalog.json", 1) || {};
  var on = (s.labels || D.DEFAULT_LABELS).slice();
  var all = D.ALL_LABELS.slice();
  on.forEach(function (l) { if (!D.has(all, l)) all.push(l); }); // keep labels added by hand
  var m = { "": { title: "Logger labels", back: back } };
  all.forEach(function (l) {
    m[l] = {
      value: D.has(on, l),
      onchange: function (v) {
        on = all.filter(function (x) { return x === l ? v : D.has(on, x); });
        s.labels = on;
        ST.writeJSON("datalog.json", s);
      }
    };
  });
  E.showMenu(m);
})
