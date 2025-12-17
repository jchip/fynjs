# Optional Peer Dependency Test Scenario

Tests that fyn respects `peerDependenciesMeta` and does not warn about missing
peer dependencies when they are marked as optional.

## step-01

Installs mod-f@3.0.0 which has mod-a as an optional peer dependency.
Should NOT warn about the missing peer dependency since it's optional.
