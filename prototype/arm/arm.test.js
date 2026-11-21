const A = require('./arm.js'), C = require('./core.js'); let fails = 0;
const ok = (n, c, d) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (d ? '  ' + d : '')); if (!c) fails++; };
const { s, errors } = A.solve(A.PARAMS);
ok('parameters solve', !Object.keys(errors).length, JSON.stringify(errors));
const t0 = Date.now(); const parts = A.buildParts(s); const ms = Date.now() - t0;
const gr = {}; for (const k in parts) gr[k] = A.grams(parts[k], s);
ok('all parts build', Object.keys(parts).length === 7, ms + ' ms');
for (const k in parts) { const v = C.volume(C.triangles(parts[k])); ok('part ' + k + ' is a solid', v > 0, (v / 1000).toFixed(1) + ' cm3, ' + gr[k].toFixed(1) + ' g printed'); }
const plain = C.volume(C.triangles(C.box(-14.85, -3, 0, 29.7, 6, 120)));
ok('upper arm has holes cut (less than its plain plate)', C.volume(C.triangles(parts.upper)) < plain + 2 * Math.PI * 14.85 * 14.85 * 6);
const up = A.tip(s, { base: 0, shoulder: 0, elbow: 0, wrist: 0 });
ok('straight up height = base + turntable + shoulder + links + tip', Math.abs(up.z - (48 + 6 + 60 + 120 + 110 + 40 + 45)) < 1e-9, up.z.toFixed(1) + ' mm');
const fwd = A.tip(s, { base: 0, shoulder: 90, elbow: 0, wrist: 0 });
ok('straight forward reach = sum of lengths', Math.abs(fwd.x - (120 + 110 + 85)) < 1e-9 && Math.abs(fwd.z - 114) < 1e-9, fwd.x.toFixed(1) + ' mm at z ' + fwd.z.toFixed(1));
const side = A.tip(s, { base: 90, shoulder: 90, elbow: 0, wrist: 0 });
ok('base yaw turns reach to Y', Math.abs(side.y - 315) < 1e-9 && Math.abs(side.x) < 1e-9);
const cloud = A.reachCloud(s);
ok('reach cloud has points above the desk', cloud.pts.length > 500 && cloud.pts.every(p => p[1] >= 5), cloud.pts.length + ' points, max reach ' + cloud.maxR.toFixed(0) + ' mm');
const L = A.loads(s, gr);
L.forEach(l => ok(l.joint + ' load computed', l.need > 0, l.need.toFixed(2) + ' kg.cm of ' + l.servo.torque + ' (' + (l.share * 100).toFixed(0) + '%)'));
// Longer arm -> more shoulder load
const s2 = Object.assign({}, s, { upper_len: 200, fore_len: 180 }); const p2 = A.buildParts(s2); const g2 = {}; for (const k in p2) g2[k] = A.grams(p2[k], s2);
ok('longer arm loads the shoulder more', A.loads(s2, g2)[0].need > L[0].need, A.loads(s2, g2)[0].need.toFixed(2) + ' kg.cm');
console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
