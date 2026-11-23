# Contributing

See [AGENTS.md](AGENTS.md) for the conventions, test API and workflow. In short:

1. Branch `proto/NN-<slug>`, one PR per prototype.
2. `npm test` and `npm run test:harness` must pass (CI runs both).
3. Add hardware checks to `apps/<id>/HW-TESTS.md` and the tutorial to `tutorials/`.
