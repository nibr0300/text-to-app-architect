# AGENTS.md

## Architecture decisions

- The pipeline has an explicit **App Contract stage** between spec and code generation (`src/lib/appContract.ts`, `src/components/ContractViewer.tsx`). The contract YAML is derived deterministically from the AppSpec — never via an AI call — so it costs nothing and is reproducible. Approval is keyed to the spec identity (appName/packageName/description) and persisted in localStorage; a new spec invalidates the previous approval. Code generation UI is gated on approval.
