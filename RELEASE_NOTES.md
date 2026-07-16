# OrganizeALot v2.1.0 Build 023 — Test Build

Build 022 remains the locked working baseline. Build 023 is a separate test build.

## New in Build 023

- Added a default 2D, one-dimensional measurement sketch for NIIS reference entry.
- Enter each wall run as Forward, Right, Back, or Left.
- Fast command entry supports phrases such as: `Forward 16, Right 4, Forward 16, Left 4, Forward 16`.
- Voice measurement entry is available when the browser supports speech recognition.
- Multiple separately calculated sections support:
  - Main house living area
  - Detached guest house / other living area
  - Attached garage
  - Covered porch
  - Deck / uncovered porch
  - Detached garage
  - Outbuildings 1, 2, 3, etc.
- Story/level multiplier calculates total square footage for one-story, two-story, and split sections.
- Automatic footprint area and category totals.
- Downloadable SVG sketch and print view.
- Waze remains available from the new-inspection screen and inside each inspection.
- Six newest inspections stay in Resume Inspections; older inspections appear under Archived Inspections.
- Unlimited photos per checklist item with preview, Use Photo, Retake, notes, and Delete Photo beneath each stored photo.
- Preferred Reports includes a 13-section photo workflow.
- Optional full-size browser download after Use Photo.

## Important Android Gallery Limitation

This web/PWA build can trigger a separate downloaded copy. Direct automatic saving to `Pictures/OrganizeALot/<Inspection ID>` requires the later native Android APK build.

## Test Focus

1. Create a residential inspection with an Inspection ID and address.
2. Open 2D Sketch.
3. Add a main-house section and enter a complete perimeter.
4. Test a jog such as `Forward 16, Right 4, Forward 16, Left 4, Forward 16`.
5. Add separate one-story and two-story sections and confirm square footage totals.
6. Add garage, covered porch, deck, detached garage, guest house, and outbuilding sections.
7. Save, close, reopen, and confirm sketch measurements remain.
