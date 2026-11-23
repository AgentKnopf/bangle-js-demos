// Tap counter logic. No Bangle/g calls here, so tests can drive it with plain numbers.
exports.RESET_MS = 60000;

exports.create = function (opts) {
  var resetMs = (opts && opts.resetMs) || exports.RESET_MS;
  var count = 0, last;
  return {
    tap: function (t) { count++; last = t; return count; },
    // Returns true if the count was reset because no tap arrived for resetMs.
    tick: function (t) {
      if (count && t - last >= resetMs) { count = 0; last = undefined; return true; }
      return false;
    },
    count: function () { return count; }
  };
};

exports.label = function (n) { return n === 1 ? "1 tap" : n + " taps"; };
