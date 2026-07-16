# OrganizeALot v2.1.0 Build 023 — Story Transition Test

Build 022 remains the locked working baseline. This is a separate Build 023 test update.

## Critical Story-Transition Fix

Build 023 now treats a change from two stories to one story as a change **within the same house**, not as a new sketch or separate building.

- Say `Begin 1 story` at the corner where the lower section starts.
- The next wall measurements are recorded as one-story walls.
- Say `Begin 2 story` when the perimeter returns to the taller section.
- The sketch marks each transition point and labels the one-story and two-story areas.
- When the outline is closed, the app connects the transition points with an internal divider and calculates each footprint separately.
- Example: a 600 sq ft two-story section plus a 200 sq ft one-story section is counted as 1,400 sq ft of living area.
- Each measurement in the list shows the story level that applies to that wall run.

## Voice Entry

- `write` and `rite` are corrected to `Right` while entering sketch commands.
- Story changes and measurements are preserved in the order spoken.
- Example: `17 feet forward, begin 1 story, 12 feet right` records 17 feet at the existing story level, changes at that corner, then records 12 feet as one story.
- Spoken number words such as `one`, `seventeen`, `forty`, and `one hundred` are supported.

## Other Build 023 Features

- 2D Forward, Right, Back, and Left measurement sketch for NIIS reference entry.
- Separate structures for garages, porches, decks, guest houses, and numbered outbuildings.
- Downloadable SVG sketch and print view.
- Waze from the new-inspection screen and inside each inspection.
- Six newest inspections in Resume Inspections with older records archived.
- Unlimited photos per checklist item with preview, retake, notes, and deletion.
- Preferred Reports 13-section workflow and OBS exterior-only workflow.

## Test Focus

1. Start one Main House structure at two stories.
2. Enter the taller-section wall measurements.
3. At the correct corner, enter or say `Begin 1 story` and continue around the lower addition.
4. Enter or say `Begin 2 story` where the perimeter returns to the taller section.
5. Close the outline.
6. Confirm the sketch displays separate `1 Story` and `2 Story` areas and the total square footage is correct.
