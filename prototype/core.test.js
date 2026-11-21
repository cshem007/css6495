const C = require('./core.js'); let fails = 0;
const ok = (n, c, d) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (d ? '  ' + d : '')); if (!c) fails++; };
const near = (a, b, t = 1e-6) => Math.abs(a - b) <= t * Math.max(1, Math.abs(b));
const vol = p => C.volume(C.triangles(p));
ok('box volume', near(vol(C.box(0, 0, 0, 40, 20, 10)), 8000));
const cyl = C.cylinder({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 10 }, 3, 40);
const area = 0.5 * 40 * 9 * Math.sin(2 * Math.PI / 40);
ok('cylinder outward + volume', near(vol(cyl), area * 10), vol(cyl).toFixed(3));
const plate = C.subtract(C.box(-20, -10, 0, 40, 20, 10), C.cylinder({ x: 0, y: 0, z: -2 }, { x: 0, y: 0, z: 12 }, 3, 40));
ok('through hole', near(vol(plate), 8000 - area * 10), vol(plate).toFixed(3));
ok('union overlap', near(vol(C.union(C.box(0, 0, 0, 20, 10, 10), C.box(10, 0, 0, 20, 10, 10))), 3000));
ok('expr', C.evalExpr('(width - 2*thick)/2', { width: 600, thick: 18 }) === 282);
let threw = false; try { C.evalExpr('alert(1)', {}); } catch (e) { threw = true; } ok('expr rejects code', threw);
threw = false; try { C.evalExpr('width', {}); } catch (e) { threw = /unknown/.test(e.message); } ok('expr unknown name', threw);
// The sample shelf as a model: changing width must move everything.
const shelf = w => ({ params: [{ name: 'width', expr: String(w) }, { name: 'depth', expr: '200' }, { name: 'height', expr: '700' }, { name: 'thick', expr: '18' }, { name: 'shelves', expr: '3' }],
  features: [
    { id: 'a', type: 'box', op: 'add', x: '0', y: '0', z: '0', w: 'thick', d: 'depth', h: 'height' },
    { id: 'b', type: 'box', op: 'add', x: 'width - thick', y: '0', z: '0', w: 'thick', d: 'depth', h: 'height' },
    { id: 'c', type: 'box', op: 'add', x: 'thick', y: '0', z: '0', w: 'width - 2*thick', d: 'depth', h: 'thick', count: 'shelves', sz: '(height - thick)/(shelves - 1)' },
    { id: 'd', type: 'cylinder', op: 'cut', axis: 'x', x: '-1', y: 'depth/2', z: 'height - 60', r: '2.5', len: 'width + 2' }] });
const s1 = C.build(shelf(600)), s2 = C.build(shelf(800));
const b1 = C.bounds(s1.solid), b2 = C.bounds(s2.solid);
ok('shelf builds without errors', !Object.keys(s1.errors).length, JSON.stringify(s1.errors));
ok('shelf width 600', near(b1.max.x - b1.min.x, 600), (b1.max.x - b1.min.x).toFixed(2));
ok('change width to 800 -> 800', near(b2.max.x - b2.min.x, 800));
const expect = 2 * 18 * 200 * 700 + 3 * (600 - 36) * 200 * 18 - 2 * (Math.PI * 2.5 * 2.5 * 0.9959) * 18; // two side holes through 18 mm sides (approx area)
ok('shelf volume about right (holes cut)', Math.abs(vol(s1.solid) - expect) / expect < 0.001, vol(s1.solid).toFixed(0) + ' vs ~' + expect.toFixed(0));
const t0 = Date.now(); for (let i = 0; i < 5; i++) C.build(shelf(600 + i)); ok('rebuild speed', true, ((Date.now() - t0) / 5).toFixed(0) + ' ms per rebuild');
// StarkWorkshop import: a 40x10x20 cube with a hole cylinder along Z.
const imp = C.fromStarkParts({ parts: [
  { name: 'Box', type: 'Cube', w: 0.04, h: 0.01, d: 0.02, origin: [0, 0, 5], ax: [1000, 0, 0], ay: [0, 0, 1000], az: [0, 1000, 0], hole: false },
  { name: 'Pin', type: 'Cylinder', r1: 0.003, h: 0.03, origin: [0, 0, 5], ax: [1000, 0, 0], ay: [0, 0, 1000], az: [0, 1000, 0], hole: true }] });
const ib = C.build(imp.model);
ok('import maps both parts', imp.model.features.length === 2 && !imp.skipped.length);
ok('imported part with hole has right volume', Math.abs(vol(ib.solid) - (8000 - area / 9 * 9 * 10)) < 1, vol(ib.solid).toFixed(2));
console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
