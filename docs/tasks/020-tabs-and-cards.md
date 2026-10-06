# Tabs and card spacing

Status: verified locally; not deployed.

Scope: shared workspace tabs and panel/portal card spacing. Preserve workflows, routes,
permissions and data. Keep existing typefaces and navy/white/blue shell palette, with
muted #e9eef4 for the tab track. Selected tabs use a white surface and bold dark text;
keyboard focus remains explicit. Tabs scroll inside their own strip on narrow phones.

Fix duplicate gap-plus-margin spacing in portal grids/stacks, top heading margins and
panel header alignment. Grid owns card separation. Add pressed state to workspace view
buttons without claiming the full ARIA tab keyboard pattern.

Acceptance: switch views, check selected/focus states, populated and empty cards, narrow
viewport overflow, full verification. No deployment in this change. Reviewer: self-review.

Browser review found a nested tab component remounting on selection; extracted it to
module scope to preserve focus and strip scroll. Desktop screenshots reviewed populated
tasks/projects. At 320px the Forms empty state stayed within the viewport. Final rerun
and focus regression check pending.

Final full gate: all six steps passed, evidence
`work/verification/2026-10-06T05-52-10.797Z-66019/result.json`.
Final browser regression: at 320px clicking Forms retained focus on Forms and strip
scrollLeft 231.5; keyboard Enter selected Projects and retained focus. Populated info
cards had no document overflow at 390/768/1440px. Viewport reset; synthetic SQLite
preview removed. No production writes. Physical-device/assistive-technology testing
was not performed.
