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
