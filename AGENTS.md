# AGENTS.md

## Architecture decisions

- The pipeline has an explicit **App Contract stage** between spec and code generation (`src/lib/appContract.ts`, `src/components/ContractViewer.tsx`). The contract YAML is derived deterministically from the AppSpec — never via an AI call — so it costs nothing and is reproducible. Approval is keyed to the spec identity (appName/packageName/description) and persisted in localStorage; a new spec invalidates the previous approval. Code generation UI is gated on approval.
- The completion percentage shown to the user is **computed from evidence** (`src/lib/completeness.ts`: contract acceptance tests, deterministic static analysis, finding severities, with caps for compile blockers and critical findings); an AI's own estimate is displayed only as a labelled comparison. A review is also **never re-run when its inputs are unchanged** (`reviewInputKey`: files, spec, directives, reference material), because it would return the same answer at the same cost. Why: model-estimated progress fluctuated between identical runs and burned credits without informing the user.
