// gest.app.js, step 1: the skeleton, one menu entry per part of the plan
Bangle.setPollInterval(80); // 12.5 Hz, the rate the model will be trained at
var LABELS = ["none", "flick-left", "flick-right", "twist", "raise", "shake"];

function showMenu() {
  Bangle.setUI();
  E.showMenu({
    "": { title: "Gestures" },
    "Record": function () { E.showAlert("comes in step 2").then(showMenu); },
    "Run": function () { E.showAlert("comes in step 6").then(showMenu); },
    "Exit": function () { load(); }
  });
}

Bangle.loadWidgets();
Bangle.drawWidgets();
showMenu();
