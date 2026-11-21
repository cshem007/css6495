// Desk robot arm: the parts as parametric solids, the joint chain, reach, and servo load.
// Pure JS on top of core.js (CSG + formulas). Every part is built in its OWN frame:
// for a pitch link the joint axis is Y through the origin and the link points up +Z.
(function (root) {
  const C = (typeof module !== 'undefined') ? require('./core.js') : root.CORE;
  const V = (x, y, z) => ({ x, y, z });

  // Typical datasheet numbers. Servo sizes vary by maker: the page asks you to check yours.
  const PARAMS = [
    { group: 'Arm', name: 'base_w', expr: '90', note: 'base plate width' },
    { group: 'Arm', name: 'base_h', expr: '48', note: 'base height' },
    { group: 'Arm', name: 'turn_r', expr: '42', note: 'turntable radius' },
    { group: 'Arm', name: 'turn_h', expr: '6', note: 'turntable thickness' },
    { group: 'Arm', name: 'shoulder_h', expr: '60', note: 'shoulder height above turntable' },
    { group: 'Arm', name: 'upper_len', expr: '120', note: 'shoulder to elbow' },
    { group: 'Arm', name: 'fore_len', expr: '110', note: 'elbow to wrist' },
    { group: 'Arm', name: 'wrist_len', expr: '40', note: 'wrist to gripper' },
    { group: 'Arm', name: 'link_t', expr: '6', note: 'plate thickness' },
    { group: 'Arm', name: 'wall', expr: '5', note: 'material around a servo' },
    { group: 'Gripper', name: 'grip_len', expr: '45', note: 'finger length' },
    { group: 'Gripper', name: 'grip_gap', expr: '8', note: 'gap when closed' },
    { group: 'Gripper', name: 'grip_travel', expr: '18', note: 'extra opening per finger' },
    { group: 'MG996R (base, shoulder, elbow)', name: 'mg_l', expr: '40.7', note: 'body length' },
    { group: 'MG996R (base, shoulder, elbow)', name: 'mg_w', expr: '19.7', note: 'body width' },
    { group: 'MG996R (base, shoulder, elbow)', name: 'mg_hole', expr: '49.5', note: 'tab hole spacing' },
    { group: 'MG996R (base, shoulder, elbow)', name: 'mg_shaft', expr: '10', note: 'shaft from body end' },
    { group: 'MG996R (base, shoulder, elbow)', name: 'mg_screw', expr: '4.2', note: 'tab hole diameter' },
    { group: 'SG90 (wrist, gripper)', name: 'sg_l', expr: '22.7', note: 'body length' },
    { group: 'SG90 (wrist, gripper)', name: 'sg_w', expr: '12.2', note: 'body width' },
    { group: 'SG90 (wrist, gripper)', name: 'sg_hole', expr: '27.8', note: 'tab hole spacing' },
    { group: 'SG90 (wrist, gripper)', name: 'sg_shaft', expr: '6', note: 'shaft from body end' },
    { group: 'SG90 (wrist, gripper)', name: 'sg_screw', expr: '2.2', note: 'tab hole diameter' },
    { group: 'Load', name: 'payload', expr: '50', note: 'grams held at the tip' },
    { group: 'Load', name: 'print_density', expr: '0.45', note: 'share of solid plastic (infill + walls)' }
  ];
  const SERVO = { mg: { name: 'MG996R', grams: 55, torque: 9.4 }, sg: { name: 'SG90', grams: 9, torque: 1.8 } };
  const PLA = 1.24; // g/cm3

  // Helpers in a part's own frame.
  const boxC = (cx, cy, z0, w, d, h) => C.box(cx - w / 2, cy - d / 2, z0, w, d, h);         // centred in X/Y, from z0 up
  const cylY = (x, z, r, y0, y1) => C.cylinder(V(x, y0, z), V(x, y1, z), r, 36);
  const cylZ = (x, y, r, z0, z1) => C.cylinder(V(x, y, z0), V(x, y, z1), r, 36);
  const cut = (a, b) => C.subtract(a, b), add = (a, b) => C.union(a, b);

  // Servo window through a plate (normal Y), placed so the SHAFT sits at height zs.
  function servoWindow(s, k, zs, t) {
    const l = s[k + '_l'], w = s[k + '_w'], sh = s[k + '_shaft'];
    const z0 = zs - (l - sh);                                    // body from z0 to z0 + l, shaft sh from the top end
    let c = boxC(0, 0, z0, w + .4, t + 2, l + .4);                // 0.2 mm clearance each side for printing
    const mid = z0 + l / 2, hs = s[k + '_hole'] / 2, r = s[k + '_screw'] / 2;
    c = add(c, cylY(0, mid - hs, r, -t, t)); c = add(c, cylY(0, mid + hs, r, -t, t));
    return c;
  }
  // Servo horn mount: centre screw + 4 holes on the horn circle, through a plate (normal Y), at height z.
  function hornHoles(z, t, small) {
    const r0 = small ? 1.1 : 1.6, rr = small ? 5 : 7, rh = small ? .8 : 1;
    let c = cylY(0, z, r0, -t, t);
    [[rr, 0], [-rr, 0], [0, rr], [0, -rr]].forEach(([dx, dz]) => { c = add(c, cylY(dx, z + dz, rh, -t, t)); });
    return c;
  }
  // A link plate: rounded ends, horn mount at the bottom joint (z = 0), a servo for the next joint at the top (z = L).
  function link(s, L, w, horn, top) {
    const t = s.link_t;
    let p = boxC(0, 0, 0, w, t, L);
    p = add(p, cylY(0, 0, w / 2, -t / 2, t / 2)); p = add(p, cylY(0, L, w / 2, -t / 2, t / 2));
    p = cut(p, hornHoles(0, t, horn === 'sg'));
    if (top) p = cut(p, servoWindow(s, top, L, t));
    // Lightening slot between the two ends, when there is room for one.
    const room = L - (top ? s[top + '_l'] : 0) - w;
    if (room > 25) p = cut(p, boxC(0, 0, w / 2 + 4, w * .35, t + 2, room - 8));
    return p;
  }

  function solve(paramList) {
    const r = C.solveParams(paramList);
    return { s: r.vars, errors: r.errors };
  }

  // All printable parts, each in its own frame, plus how they connect.
  function buildParts(s) {
    const t = s.link_t, wmg = s.mg_w + 2 * s.wall, wsg = s.sg_w + 2 * s.wall;
    const parts = {};
    // Base: block with the yaw servo standing in a pocket (shaft up, at the centre) and 4 corner screw holes.
    let base = boxC(0, 0, 0, s.base_w, s.base_w, s.base_h);
    const zs = s.base_h; // shaft at the top centre
    base = cut(base, C.box(-(s.mg_l - s.mg_shaft) - .2, -s.mg_w / 2 - .2, 3, s.mg_l + .4, s.mg_w + .4, s.base_h));   // pocket, 3 mm floor
    const mid = -(s.mg_l - s.mg_shaft) + s.mg_l / 2;
    [-1, 1].forEach(k => { base = cut(base, cylZ(mid + k * s.mg_hole / 2, 0, s.mg_screw / 2, 3, s.base_h + 1)); });
    const q = s.base_w / 2 - 8;
    [[q, q], [-q, q], [q, -q], [-q, -q]].forEach(([x, y]) => { base = cut(base, cylZ(x, y, 2.1, -1, s.base_h + 1)); });
    parts.base = base;
    // Turntable: disc on the base servo horn, with the shoulder bracket (a plate carrying the shoulder servo).
    let tt = cylZ(0, 0, s.turn_r, 0, s.turn_h);
    tt = cut(tt, cylZ(0, 0, 1.6, -1, s.turn_h + 1));
    [[7, 0], [-7, 0], [0, 7], [0, -7]].forEach(([x, y]) => { tt = cut(tt, cylZ(x, y, 1, -1, s.turn_h + 1)); });
    const by = -(t + 1);                                         // bracket sits beside the upper arm plate
    let br = C.box(-wmg / 2, by - t / 2, s.turn_h, wmg, t, s.shoulder_h);
    br = add(br, cylY(0, s.turn_h + s.shoulder_h, wmg / 2, by - t / 2, by + t / 2));
    const win = servoWindow(s, 'mg', s.turn_h + s.shoulder_h, t).map(p => p); // window is centred on y = 0; move it to the bracket
    br = cut(br, shiftY(win, by));
    parts.turntable = add(tt, br);
    // Arm links, alternating sides so each servo body sits in one plate and drives the next.
    parts.upper = link(s, s.upper_len, wmg, 'mg', 'mg');
    parts.fore = link(s, s.fore_len, wmg, 'mg', 'sg');
    parts.wrist = link(s, s.wrist_len, wsg, 'sg', null);
    // Gripper: palm across the wrist end + two fingers (built at the closed position; fingers slide in X).
    const palmW = s.grip_gap + 2 * (s.grip_travel + 8);
    parts.palm = C.box(-palmW / 2, -t / 2, 0, palmW, t * 2, 8);
    parts.finger = C.box(0, -t / 2, 0, 6, t * 2, s.grip_len);
    return parts;
  }
  function shiftY(polys, dy) { return polys.map(p => ({ v: p.v.map(v => ({ x: v.x, y: v.y + dy, z: v.z })), p: { n: p.p.n, w: p.p.w + p.p.n.y * dy } })); }

  // Where each joint is, in its parent's frame. Pitch joints turn about Y; positive tips the arm forward (+X).
  function chain(s) {
    const t = s.link_t;
    return {
      j1: { z: s.base_h },                                        // base yaw (about Z)
      j2: { z: s.turn_h + s.shoulder_h, y: 0 },                   // shoulder, in the turntable frame
      j3: { z: s.upper_len, y: t + 1 },                           // elbow: forearm plate beside the upper arm
      j4: { z: s.fore_len, y: -(t + 1) },                         // wrist: back to the middle line
      grip: { z: s.wrist_len },
      tip: s.wrist_len + s.grip_len
    };
  }

  // Tip position for joint angles (degrees), in the base frame. Same maths the 3D view does with groups.
  function tip(s, a) {
    const r = d => d * Math.PI / 180, c = chain(s);
    const a1 = r(a.shoulder), a2 = a1 + r(a.elbow), a3 = a2 + r(a.wrist);
    const reach = s.upper_len * Math.sin(a1) + s.fore_len * Math.sin(a2) + c.tip * Math.sin(a3);
    const z = s.base_h + c.j2.z + s.upper_len * Math.cos(a1) + s.fore_len * Math.cos(a2) + c.tip * Math.cos(a3);
    const yaw = r(a.base);
    return { x: reach * Math.cos(yaw), y: reach * Math.sin(yaw), z, reach };
  }

  const LIMITS = { base: [-90, 90], shoulder: [-90, 90], elbow: [-135, 135], wrist: [-90, 90] };

  // Reachable tip points in the arm's plane (r = forward, z = up), skipping any that would go into the desk.
  function reachCloud(s) {
    const pts = []; let maxR = 0, maxZ = 0;
    for (let sh = -90; sh <= 90; sh += 7.5) for (let el = -135; el <= 135; el += 11.25) for (const wr of [-60, -20, 20, 60]) {
      const p = tip(s, { base: 0, shoulder: sh, elbow: el, wrist: wr });
      if (p.z < 5) continue;
      pts.push([p.reach, p.z]); maxR = Math.max(maxR, Math.abs(p.reach)); maxZ = Math.max(maxZ, p.z);
    }
    return { pts, maxR, maxZ };
  }

  // Worst-case static load (arm straight out sideways) on each pitch servo, in kg.cm, versus its rating.
  function loads(s, partGrams) {
    const g = (k) => partGrams[k] || 0, c = chain(s);
    const tipLen = c.tip, L1 = s.upper_len, L2 = s.fore_len;
    // [grams, distance from the joint in mm] for everything beyond each joint
    const fromWrist = [[g('wrist'), s.wrist_len / 2], [SERVO.sg.grams + g('palm') + 2 * g('finger'), s.wrist_len + s.grip_len / 3], [s.payload, tipLen]];
    const fromElbow = [[g('fore'), L2 / 2], [SERVO.sg.grams, L2]].concat(fromWrist.map(([m, d]) => [m, d + L2]));
    const fromShoulder = [[g('upper'), L1 / 2], [SERVO.mg.grams, L1]].concat(fromElbow.map(([m, d]) => [m, d + L1]));
    const kgcm = list => list.reduce((t, [m, d]) => t + (m / 1000) * (d / 10), 0);
    return [
      { joint: 'Shoulder', servo: SERVO.mg, need: kgcm(fromShoulder) },
      { joint: 'Elbow', servo: SERVO.mg, need: kgcm(fromElbow) },
      { joint: 'Wrist', servo: SERVO.sg, need: kgcm(fromWrist) }
    ].map(x => Object.assign(x, { share: x.need / x.servo.torque }));
  }

  function grams(polys, s) { return Math.max(0, C.volume(C.triangles(polys))) / 1000 * PLA * s.print_density; }

  const api = { PARAMS, SERVO, LIMITS, solve, buildParts, chain, tip, reachCloud, loads, grams };
  if (typeof module !== 'undefined') module.exports = api; else root.ARM = api;
})(this);
