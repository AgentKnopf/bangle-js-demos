// A file whose top level throws must be reported as an error, not as "passed".
T.test("[pass] would pass", function () {});
thisFileIsBroken();
