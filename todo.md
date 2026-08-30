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

## Global 1.0 visual refresh

- [x] Replace application red accents with gold/light-gold while preserving severity meaning through neutral contrast and labels.
- [x] Update the sidebar brand treatment to “Website Intelligence Auditor” and add a flashing AUDITOR word effect.
- [x] Add the grading scale display to the results dossier.
- [x] Apply the generated signal mark as the favicon where supported.
- [x] Preserve layout, workflow, scoring dimensions, and current audit interactions.
- [x] Run typecheck/build and capture a final visual verification screenshot.

## Sidebar wordmark refinement

- [ ] Set “Website Intelligence” to white beside the logo icon.
- [ ] Set “Auditor” to red and preserve its flashing effect.
- [ ] Update the visible engine version to Matrix v1.0.0.
- [ ] Verify and save the updated version.

## Logo and completion status refinement

- [x] Restore the sidebar logo icon to red while leaving the favicon unchanged.
- [x] Show completed audit status as green COMPLETE.
- [x] Verify the updated states and save the live version.

## Expandable score-detail enhancement

- [x] Inspect the current score-dimension data and interaction.
- [x] Add expandable panels with metric values, pass/fail counts, weights, and contributions.
- [x] Add dimension formulas, interpretation, priority context, and strategic recommendations.
- [x] Style the panels responsively and preserve keyboard-accessible collapse controls.
- [x] Run typecheck/build and verify the landing workspace visually.
