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


## Voice Story Auto-Apply Fix
- Tapping **Speak & Apply** now applies the recognized command to the sketch immediately; it no longer only repeats the words in the text box.
- `Begin 1 story, 17 feet forward` changes the same house to one story at the current corner, then draws the 17-foot wall as one story.
- Commands spoken before the story change stay at the old story level; commands spoken after it use the new story level.
- Added recognition for common variations such as `start 1 story`, `change to 1 story`, `drop to 1 story`, `return to 2 story`, and `storey`.
- The status message confirms exactly what was heard and applied.
- Updated the service-worker cache so the laptop loads this fix instead of the prior cached files.

## Clear/Delete regression fix
- Restored reliable Clear Section and Delete Section button actions after the story-transition update.
- Clear Section now removes all measurements and story transitions while keeping the section ready to redraw.
- Delete Section now visibly removes the selected section and selects the remaining section; deleting the last section creates a fresh blank Main House section.
- Added explicit non-submit button behavior and refreshed the service-worker cache.


## Return-to-two-story voice fix
- Added recognition for `Start 2nd story`, `Start second story`, `Start the second story`, and `Star 2nd story`.
- Spoken ordinal words such as `first` and `second`, plus typed or recognized forms such as `1st` and `2nd`, are converted to normal story numbers.
- Returning from the one-story section to the two-story section now creates the second transition at the current corner and applies two stories to the next wall run.
- Updated the service-worker cache so the corrected parser loads immediately.


## Detached-structure spacing fix
- New detached guest houses, detached garages, and outbuildings are automatically placed to the right of the existing sketch with a minimum 15-foot clear gap.
- Existing detached sections created before this update are migrated to the same minimum spacing when they did not already have a stored position.
- Closing a detached outline now returns to that structure's own starting point rather than the Main House origin.
- Updated the service-worker cache so the new spacing loads immediately.
