const M = require('./model.js'), C = require('./core.js'); let fails = 0;
const ok = (n, c, d) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (d ? '  ' + d : '')); if (!c) fails++; };
const vol = s => C.volume(C.watertight(s)), near = (a, b, t = 1e-3) => Math.abs(a - b) <= t * Math.max(1, Math.abs(b));
const plate = { id: 'f1', name: 'Plate', shape: 'rect', op: 'add', plane: M.GROUND, x: '0', y: '0', w: '80', h: '40', dist: '6' };
let model = { params: [], features: [plate] };
let r = M.build(model);
ok('sketch rectangle on ground + extrude 6', near(vol(r.solid), 80 * 40 * 6), vol(r.solid).toFixed(1));
// Sketch a circle on the TOP face and cut down through it.
const top = M.frameFromNormal(M.V(0, 0, 1), 6);
ok('top face frame sits at z = 6', top.o.z === 6 && top.n.z === 1);
model.features.push({ id: 'f2', name: 'Hole', shape: 'circle', op: 'cut', plane: top, cx: '20', cy: '20', r: '4', dist: '-6' });
r = M.build(model);
const holeA = 0.5 * 48 * 16 * Math.sin(2 * Math.PI / 48);
ok('circle on top face cut through', near(vol(r.solid), 80 * 40 * 6 - holeA * 6), vol(r.solid).toFixed(1));
// Sketch on the SIDE face (+x at x = 80) and extrude a tab outward.
const side = M.frameFromNormal(M.V(1, 0, 0), 80);
ok('side face frame: normal +x, v points up', side.n.x === 1 && side.v.z === 1, JSON.stringify(side));
model.features.push({ id: 'f3', name: 'Tab', shape: 'rect', op: 'add', plane: side, x: '0', y: '0', w: '20', h: '6', dist: '15' });
r = M.build(model);
const b = C.bounds(r.solid);
ok('tab sticks out 15 mm on the side', near(b.max.x, 95), 'max x ' + b.max.x.toFixed(2));
// Pick faces back from surface points.
const vars = r.vars;
const planes = r.planes;
let p = M.pickFace(model, vars, M.V(40, 20, 6), M.V(0, 0, 1), planes);
ok('pick top of plate', p && p.f.id === 'f1' && p.face.id === 'top');
p = M.pickFace(model, vars, M.V(95, 5, 3), M.V(1, 0, 0), planes);
ok('pick end of tab', p && p.f.id === 'f3' && p.face.id === 'top');
p = M.pickFace(model, vars, M.V(24, 20, 3), M.V(-1, 0, 0), planes);
ok('pick wall of the hole (round)', p && p.f.id === 'f2' && p.face.id === 'side', p && p.face.id);
// Push/pull: drag the plate top up 4 mm -> 10 thick.
const d1 = Object.assign(M.dims(plate, vars), { plane: plate.plane });
model.features[0] = M.applyDelta(plate, 'top', 4, d1);
r = M.build(model);
ok('push/pull top +4 -> plate 10 thick (hole now blind)', near(C.bounds(r.solid).max.z, 10));
// Drag the -u side out by 10 -> plate grows to the left, keeps its right edge.
const pl = model.features[0], d2 = Object.assign(M.dims(pl, r.vars), { plane: pl.plane });
model.features[0] = M.applyDelta(pl, '-u', 10, d2);
r = M.build(model);
const b2 = C.bounds(r.solid);
ok('push/pull left side out 10', near(b2.min.x, -10) && model.features[0].w === '90', 'min x ' + b2.min.x + ', w ' + model.features[0].w);
// Drag the hole wall: the wall faces into the hole; moving it along the feature's outward normal grows the radius.
const hole = model.features[1], d3 = Object.assign(M.dims(hole, r.vars), { plane: hole.plane });
model.features[1] = M.applyDelta(hole, 'side', 1, d3);
ok('push/pull hole wall -> radius 5', model.features[1].r === '5');
// Formulas still work in sketch numbers.
model.params = [{ name: 'len', expr: '120' }]; model.features[0].w = 'len - 30';
r = M.build(model); ok('formula in a sketch size', near(C.bounds(r.solid).max.x - C.bounds(r.solid).min.x, 105), (C.bounds(r.solid).max.x - C.bounds(r.solid).min.x).toFixed(1));
// Bad numbers report, they don't crash.
model.features[2].dist = '0'; r = M.build(model); ok('zero distance is an error, not a crash', !!r.errors.f3, r.errors.f3);
// Sketch attached to a face follows it: hole on the plate's top, then the plate gets thicker.
const m2 = { params: [], features: [
  { id: 'a', name: 'Plate', shape: 'rect', op: 'add', plane: M.GROUND, x: '0', y: '0', w: '60', h: '40', dist: '10' },
  { id: 'b', name: 'Hole', shape: 'circle', op: 'cut', plane: { ref: { f: 'a', face: 'top' } }, cx: '30', cy: '20', r: '5', dist: '-10' }] };
let r2 = M.build(m2); const ha = 0.5 * 48 * 25 * Math.sin(2 * Math.PI / 48);
ok('attached hole cuts through 10 mm plate', near(vol(r2.solid), 24000 - ha * 10), vol(r2.solid).toFixed(0));
m2.features[0].dist = '20'; r2 = M.build(m2);
ok('plate 20 thick: the hole moved up with the top face (10 deep from the top)', near(vol(r2.solid), 48000 - ha * 10) && near(r2.planes.b.o.z, 20), 'hole plane z ' + r2.planes.b.o.z);
m2.features[0].skip = true; r2 = M.build(m2);
ok('skipping the base reports the sketch face is gone', /gone/.test(r2.errors.b || ''), r2.errors.b);
console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
