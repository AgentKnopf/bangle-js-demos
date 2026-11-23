// Step 1: one buzz, then another; tap the screen to run it again
function line(i, text) {
  g.reset().clearRect(0, 20 + i * 24, 175, 43 + i * 24);
  g.setFont("Vector", 18).setFontAlign(-1, 0).drawString(text, 6, 32 + i * 24);
}
function run() {
  var t0 = Date.now();
  function ms() { return Math.round(Date.now() - t0) + " ms"; }
  g.clear();
  line(0, "buzz 200 ms 100%");
  Bangle.buzz(200, 1).then(function () {
    line(1, "1st done " + ms());
    line(2, "buzz 100 ms 50%");
    return Bangle.buzz(100, 0.5);
  }).then(function () { line(3, "2nd done " + ms()); });
  line(5, "buzz() returned");        // drawn before either buzz has finished
  print("this prints first: buzz() does not block");
}
Bangle.setUI({ mode: "custom", touch: run, btn: function () { load(); } });
run();
