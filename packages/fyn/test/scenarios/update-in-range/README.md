# Scenario

- A lock pins `mod-a@1.0.0` and, under `mod-i`, `mod-g@3.0.0`
- The registry has newer in-range versions: `mod-a@1.1.2` and `mod-g@3.0.11`

# Expect Behavior

- `fyn update mod-i` updates `mod-i` and its transitive `mod-g`, and keeps `mod-a` pinned
- `fyn update` updates everything else, here `mod-a`
- `fyn update` with a package that isn't locked fails
