// Whole app: exit path.
var power = [];
var origPower = Bangle.setHRMPower;
Bangle.setHRMPower = function (on, id) { power.push([on ? 1 : 0, id]); return origPower.call(Bangle, on, id); };
eval(require("Storage").read("hrstream.app.js"));
DEBUG = true;
T.beforeEach(function () { T.capture(); });

T.test("startup powers the HRM with the app id and declares the services", function () {
  T.eq(power, [[1, "hrstream"]]);
});

T.test("kill turns off the HRM and clears the services", function (done) {
  var svc = T.spy(NRF, "setServices", function () {});
  T.emit(E, "kill", undefined, function () {
    T.eq(power[power.length - 1], [0, "hrstream"], "setHRMPower(0, app id)");
    T.eq(Bangle.isHRMOn(), false, "Bangle.isHRMOn()");
    T.eq(svc.calls.length, 1);
    T.eq(svc.calls[0][0], {});
    T.eq(T.eventsOf("kill").length, 1);
    done();
  });
});

T.test("button exits to the launcher", function (done) {
  var load = T.spy(global, "load", function () {});
  T.press(100);
  setTimeout(function () { T.eq(load.calls.length, 1); done(); }, 500);
});
