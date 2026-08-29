# Audit Engine Integration TODO

- [x] Add a deterministic URL-dependent audit result object with unique audit ID and timestamp.
- [x] Derive page, technical, accessibility, content, link, performance, UX, semantic, graph, claim, and evidence metrics from submitted URL characteristics.
- [x] Compute weighted dimension scores and overall score only from collected metrics.
- [x] Make confidence depend on crawl coverage, render success, metric availability, semantic coverage, and crawl errors.
- [x] Replace fixed findings and recommendations with metric-derived outputs.
- [x] Add score traceability and a “Why this score?” contributor panel.
- [x] Make the intelligence graph website-specific based on inferred site archetype.
- [x] Add a visible audit trace mode in the results UI.
- [x] Add regression checks proving different URLs and metric changes yield different scores.
- [x] Verify the app with typecheck, production build, and representative visual screenshots.
