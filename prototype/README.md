# CSS Design (prototype)

A parametric CAD editor in the browser, plus a real-size view in VR.

- **Desktop:** parameters (like `width = 600`), features (box, cylinder, hole), a timeline, exact sizes in mm.
  Any size can be a formula, like `width - 2*thick`. Change a parameter and every feature updates.
- **Quest:** open the page in the Quest browser and press **View at real size**. The design stands on your
  floor at 1:1. Pinch to bring it in front of you.
- **From StarkWorkshop:** **Open file** accepts the `parts.json` that StarkWorkshop's "print it" writes.

`index.html` is the whole app. `core.js` is the same geometry and formula code on its own, tested with
`node core.test.js`.

Status: prototype. Tested in desktop Chromium. Not yet tried on a Quest.

## Desk robot arm (`arm/`)

An assembly workspace: a printable desk arm with 4 joints and a gripper (3 × MG996R, 2 × SG90).
Every size is a parameter. Move the joints with sliders or play the pick-and-place demo, see the
reach, check each servo's worst-case load against its rating, and download an STL per part.
On the Quest browser, **View at real size** puts it on a desk in front of you. Test: `node arm.test.js`.

## Design from scratch (`sketch/`)

Start from an empty grid: **R** for a rectangle, **C** for a circle, drag on the grid or on any face,
then extrude by dragging or typing a distance (into the part makes a cut). With **Select**, drag any
face to push or pull it. Sketches stay attached to the face they were drawn on, so they follow when
that face moves. Every number can be a formula of parameters. Test: `node model.test.js`.
