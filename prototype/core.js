// CSS Design core: CSG (port of csg.js by Evan Wallace, MIT), a safe expression parser, and the
// parametric model evaluator. No DOM, no three.js: runs in the page and under node for tests.
(function (root) {
  // ---------------------------------------------------------------- CSG
  const EPS = 1e-5;
  const V = (x, y, z) => ({ x, y, z });
  const add = (a, b) => V(a.x + b.x, a.y + b.y, a.z + b.z), sub = (a, b) => V(a.x - b.x, a.y - b.y, a.z - b.z);
  const mul = (a, s) => V(a.x * s, a.y * s, a.z * s), dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const cross = (a, b) => V(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  const len = a => Math.sqrt(dot(a, a)), unit = a => { const l = len(a); return l > 0 ? mul(a, 1 / l) : a; };
  const lerp = (a, b, t) => add(a, mul(sub(b, a), t));

  function plane(a, b, c) { const n = cross(sub(b, a), sub(c, a)); const l = len(n); if (l < 1e-12) return null; const u = mul(n, 1 / l); return { n: u, w: dot(u, a) }; }
  const clonePlane = p => ({ n: V(p.n.x, p.n.y, p.n.z), w: p.w });
  const flipPlane = p => { p.n = mul(p.n, -1); p.w = -p.w; };
  function poly(verts, p) { p = p || plane(verts[0], verts[1], verts[2]); return p ? { v: verts, p } : null; }
  const clonePoly = q => ({ v: q.v.slice(), p: clonePlane(q.p) });
  const flipPoly = q => { q.v.reverse(); flipPlane(q.p); };

  function split(pl, q, cf, cb, f, b) {
    let type = 0; const types = [];
    for (const v of q.v) { const t = dot(pl.n, v) - pl.w; const ty = t < -EPS ? 2 : t > EPS ? 1 : 0; type |= ty; types.push(ty); }
    if (type === 0) (dot(pl.n, q.p.n) > 0 ? cf : cb).push(q);
    else if (type === 1) f.push(q);
    else if (type === 2) b.push(q);
    else {
      const fv = [], bv = [];
      for (let i = 0; i < q.v.length; i++) {
        const j = (i + 1) % q.v.length, ti = types[i], tj = types[j], vi = q.v[i], vj = q.v[j];
        if (ti !== 2) fv.push(vi);
        if (ti !== 1) bv.push(vi);
        if ((ti | tj) === 3) { const t = (pl.w - dot(pl.n, vi)) / dot(pl.n, sub(vj, vi)); const v = lerp(vi, vj, t); fv.push(v); bv.push(v); }
      }
      // Each half gets its own plane: flipping one must never flip the other.
      if (fv.length >= 3) f.push({ v: fv, p: clonePlane(q.p) });
      if (bv.length >= 3) b.push({ v: bv, p: clonePlane(q.p) });
    }
  }

  class Node {
    constructor(polys) { this.pl = null; this.f = null; this.b = null; this.polys = []; if (polys) this.build(polys); }
    invert() { this.polys.forEach(flipPoly); if (this.pl) flipPlane(this.pl); if (this.f) this.f.invert(); if (this.b) this.b.invert(); const t = this.f; this.f = this.b; this.b = t; }
    clip(list) { if (!this.pl) return list.slice(); let f = [], b = []; for (const q of list) split(this.pl, q, f, b, f, b); if (this.f) f = this.f.clip(f); b = this.b ? this.b.clip(b) : []; return f.concat(b); }
    clipTo(n) { this.polys = n.clip(this.polys); if (this.f) this.f.clipTo(n); if (this.b) this.b.clipTo(n); }
    all() { let a = this.polys.slice(); if (this.f) a = a.concat(this.f.all()); if (this.b) a = a.concat(this.b.all()); return a; }
    build(list) {
      if (!list.length) return;
      if (!this.pl) this.pl = clonePlane(list[0].p);
      const f = [], b = [];
      for (const q of list) split(this.pl, q, this.polys, this.polys, f, b);
      if (f.length) { if (!this.f) this.f = new Node(); this.f.build(f); }
      if (b.length) { if (!this.b) this.b = new Node(); this.b.build(b); }
    }
  }
  const cl = polys => polys.map(clonePoly);
  function union(A, B) { const a = new Node(cl(A)), b = new Node(cl(B)); a.clipTo(b); b.clipTo(a); b.invert(); b.clipTo(a); b.invert(); a.build(b.all()); return a.all(); }
  function subtract(A, B) { const a = new Node(cl(A)), b = new Node(cl(B)); a.invert(); a.clipTo(b); b.clipTo(a); b.invert(); b.clipTo(a); b.invert(); a.build(b.all()); a.invert(); return a.all(); }

  // Box from its MIN corner (x, y, z) and size (w along X, d along Y, h along Z). Z is up.
  function box(x, y, z, w, d, h) {
    const faces = [[[0, 4, 6, 2], -1], [[1, 3, 7, 5], 1], [[0, 1, 5, 4], -1], [[2, 6, 7, 3], 1], [[0, 2, 3, 1], -1], [[4, 5, 7, 6], 1]];
    const out = [];
    for (const [idx] of faces) {
      const vs = idx.map(i => V(x + w * (i & 1), y + d * ((i >> 1) & 1), z + h * ((i >> 2) & 1)));
      const p = poly(vs); if (p) out.push(p);
    }
    return out;
  }
  // Cylinder between two points with radius r.
  function cylinder(s, e, r, slices) {
    slices = slices || 40;
    const ray = sub(e, s), az = unit(ray), isY = Math.abs(az.y) > .5;
    const ax = unit(cross(V(isY ? 1 : 0, isY ? 0 : 1, 0), az)), ay = unit(cross(ax, az));
    const pt = (stack, t) => { const a = t * Math.PI * 2; const out = add(mul(ax, Math.cos(a)), mul(ay, Math.sin(a))); return add(add(s, mul(ray, stack)), mul(out, r)); };
    const res = [];
    for (let i = 0; i < slices; i++) {
      const t0 = i / slices, t1 = (i + 1) / slices;
      [poly([s, pt(0, t0), pt(0, t1)]), poly([pt(0, t1), pt(0, t0), pt(1, t0), pt(1, t1)]), poly([e, pt(1, t1), pt(1, t0)])].forEach(p => p && res.push(p));
    }
    return res;
  }
  // Watertight triangles: weld equal points, insert T-junction points into neighbouring edges, and
  // fan from each polygon's centroid. Same method as StarkWorkshop's Csg.ToWatertightTriangles. Without
  // it, edge lines show starbursts where a cut split one face but not its neighbour.
  function watertight(polys, weld) {
    weld = weld || 1e-4; const inv = 1 / weld, canon = new Map();
    const key = v => Math.round(v.x * inv) + ',' + Math.round(v.y * inv) + ',' + Math.round(v.z * inv);
    const C = v => { const k = key(v); let c = canon.get(k); if (!c) { c = v; canon.set(k, v); } return c; };
    const P = [];
    for (const q of polys) {
      const vs = [];
      for (const v of q.v) { const c = C(v); if (!vs.length || vs[vs.length - 1] !== c) vs.push(c); }
      if (vs.length > 1 && vs[0] === vs[vs.length - 1]) vs.pop();
      if (vs.length >= 3) P.push(vs);
    }
    const cell = 2, grid = new Map(), ck = (x, y, z) => x + '|' + y + '|' + z, cf = a => Math.floor(a / cell);
    for (const v of canon.values()) { const k = ck(cf(v.x), cf(v.y), cf(v.z)); let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(v); }
    const onSeg = (a, b) => {
      const ab = sub(b, a), l2 = dot(ab, ab), out = []; if (l2 < weld * weld) return out;
      const x0 = cf(Math.min(a.x, b.x)) - 1, x1 = cf(Math.max(a.x, b.x)) + 1, y0 = cf(Math.min(a.y, b.y)) - 1, y1 = cf(Math.max(a.y, b.y)) + 1, z0 = cf(Math.min(a.z, b.z)) - 1, z1 = cf(Math.max(a.z, b.z)) + 1;
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
        const l = grid.get(ck(x, y, z)); if (!l) continue;
        for (const p of l) { if (p === a || p === b) continue; const t = dot(sub(p, a), ab) / l2; if (t <= 1e-9 || t >= 1 - 1e-9) continue; if (len(sub(p, add(a, mul(ab, t)))) <= weld) out.push([t, p]); }
      }
      return out.sort((m, n) => m[0] - n[0]).map(m => m[1]);
    };
    const tris = [];
    for (const vs of P) {
      const o = []; let ins = false;
      for (let i = 0; i < vs.length; i++) { o.push(vs[i]); const extra = onSeg(vs[i], vs[(i + 1) % vs.length]); if (extra.length) { ins = true; o.push(...extra); } }
      if (!ins) { for (let i = 2; i < o.length; i++) tris.push([o[0], o[i - 1], o[i]]); continue; }
      let c = V(0, 0, 0); for (const v of o) c = add(c, v); c = mul(c, 1 / o.length);
      for (let i = 0; i < o.length; i++) tris.push([c, o[i], o[(i + 1) % o.length]]);
    }
    return tris;
  }
  function triangles(polys) { const t = []; for (const q of polys) for (let i = 2; i < q.v.length; i++) t.push([q.v[0], q.v[i - 1], q.v[i]]); return t; }
  const volume = tris => tris.reduce((s, t) => s + dot(t[0], cross(t[1], t[2])) / 6, 0);
  function bounds(polys) {
    if (!polys.length) return null;
    const mn = V(Infinity, Infinity, Infinity), mx = V(-Infinity, -Infinity, -Infinity);
    for (const q of polys) for (const v of q.v) { mn.x = Math.min(mn.x, v.x); mn.y = Math.min(mn.y, v.y); mn.z = Math.min(mn.z, v.z); mx.x = Math.max(mx.x, v.x); mx.y = Math.max(mx.y, v.y); mx.z = Math.max(mx.z, v.z); }
    return { min: mn, max: mx };
  }

  // ---------------------------------------------------------------- expressions
  // Numbers, parameter names, + - * / ( ) and unary minus. No eval: a typed formula can only compute.
  function evalExpr(src, vars) {
    const s = String(src == null ? '' : src).replace(/mm\b/g, ''); let i = 0;
    const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
    const fail = m => { throw new Error(m); };
    function primary() {
      ws();
      if (s[i] === '(') { i++; const v = expr(); ws(); if (s[i] !== ')') fail('missing )'); i++; return v; }
      if (s[i] === '-') { i++; return -primary(); }
      if (s[i] === '+') { i++; return primary(); }
      let m = /^\d*\.?\d+(?:e[-+]?\d+)?/i.exec(s.slice(i));
      if (m) { i += m[0].length; return parseFloat(m[0]); }
      m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
      if (m) { i += m[0].length; if (!(m[0] in vars)) fail('unknown name "' + m[0] + '"'); return vars[m[0]]; }
      fail(i >= s.length ? 'empty' : 'unexpected "' + s[i] + '"');
    }
    function term() { let v = primary(); for (;;) { ws(); if (s[i] === '*') { i++; v *= primary(); } else if (s[i] === '/') { i++; const d = primary(); if (d === 0) fail('divide by 0'); v /= d; } else return v; } }
    function expr() { let v = term(); for (;;) { ws(); if (s[i] === '+') { i++; v += term(); } else if (s[i] === '-') { i++; v -= term(); } else return v; } }
    const v = expr(); ws(); if (i < s.length) fail('unexpected "' + s[i] + '"');
    if (!isFinite(v)) fail('not a number');
    return v;
  }

  // ---------------------------------------------------------------- the parametric model
  // model = { name, params: [{name, expr}], features: [{id, name, type: 'box'|'cylinder', op: 'add'|'cut',
  //   skip, x, y, z, w, d, h (box) | r, len, axis 'x'|'y'|'z' (cylinder), count, sx, sy, sz }] }  all numbers are expressions
  function solveParams(params) {
    const vars = {}, values = {}, errors = {};
    for (const p of params) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(p.name || '')) { errors[p.name] = 'name: letters, digits, _'; continue; }
      try { vars[p.name] = values[p.name] = evalExpr(p.expr, vars); } catch (e) { errors[p.name] = e.message; }
    }
    return { vars, values, errors };
  }

  function featureSolid(f, vars) {
    const n = k => evalExpr(f[k], vars);
    const count = Math.max(1, Math.min(200, Math.round(f.count == null || f.count === '' ? 1 : n('count'))));
    const sx = f.sx ? n('sx') : 0, sy = f.sy ? n('sy') : 0, sz = f.sz ? n('sz') : 0;
    let polys = [];
    for (let k = 0; k < count; k++) {
      const ox = n('x') + sx * k, oy = n('y') + sy * k, oz = n('z') + sz * k;
      let one;
      if (f.type === 'box') {
        const w = n('w'), d = n('d'), h = n('h');
        if (w <= 0 || d <= 0 || h <= 0) throw new Error('sizes must be above 0');
        one = box(ox, oy, oz, w, d, h);
      } else {
        const r = n('r'), L = n('len');
        if (r <= 0 || L <= 0) throw new Error('radius and length must be above 0');
        const dir = f.axis === 'x' ? V(1, 0, 0) : f.axis === 'y' ? V(0, 1, 0) : V(0, 0, 1);
        const s = V(ox, oy, oz); one = cylinder(s, add(s, mul(dir, L)), r);
      }
      polys = k === 0 ? one : union(polys, one);
    }
    return polys;
  }

  // Replays the timeline. Returns the solid, per-feature errors, and each feature's own solid.
  function build(model) {
    const { vars, values, errors: paramErrors } = solveParams(model.params || []);
    let solid = [];
    const errors = {}, own = {};
    for (const f of model.features || []) {
      if (f.skip) continue;
      try {
        const fs = featureSolid(f, vars); own[f.id] = fs;
        solid = f.op === 'cut' ? (solid.length ? subtract(solid, fs) : solid) : (solid.length ? union(solid, fs) : fs);
      } catch (e) { errors[f.id] = e.message; }
    }
    return { solid, errors, paramErrors, values, own };
  }

  // StarkWorkshop parts.json -> features. Only axis-aligned Cube and Cylinder parts map exactly;
  // anything else is reported, not guessed.
  function fromStarkParts(json) {
    const parts = json.parts || [], features = [], skipped = [];
    const r2 = v => Math.round(v * 100) / 100;
    const axisOf = v => { const a = [Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2])], L = Math.hypot(...a); if (L === 0) return null; const k = a.indexOf(Math.max(...a)); return a[k] / L > .999 ? 'xyz'[k] : null; };
    parts.forEach((p, i) => {
      const L = v => Math.hypot(v[0], v[1], v[2]);
      const ax = axisOf(p.ax), ay = axisOf(p.ay), az = axisOf(p.az);
      const name = (p.name || p.type) + (p.hole ? ' (hole)' : '');
      if (p.type === 'Cube' && ax && ay && az) {
        const size = { [ax]: p.w * L(p.ax), [ay]: p.h * L(p.ay), [az]: p.d * L(p.az) };
        features.push({ id: 'f' + (i + 1), name, type: 'box', op: p.hole ? 'cut' : 'add',
          x: String(r2(p.origin[0] - size.x / 2)), y: String(r2(p.origin[1] - size.y / 2)), z: String(r2(p.origin[2] - size.z / 2)),
          w: String(r2(size.x)), d: String(r2(size.y)), h: String(r2(size.z)), count: '1', sx: '', sy: '', sz: '' });
      } else if ((p.type === 'Cylinder' || p.type === 'Tube') && ay) {
        const Lh = p.h * L(p.ay), r = p.r1 * L(p.ax), sign = p.ay['xyz'.indexOf(ay)] < 0 ? -1 : 1;
        const o = p.origin.slice(); o['xyz'.indexOf(ay)] -= Lh / 2;
        features.push({ id: 'f' + (i + 1), name, type: 'cylinder', op: p.hole ? 'cut' : 'add', axis: ay,
          x: String(r2(o[0])), y: String(r2(o[1])), z: String(r2(o[2])), r: String(r2(r)), len: String(r2(Lh)), count: '1', sx: '', sy: '', sz: '' });
        if (sign < 0) {} // a flipped axis is the same cylinder: start point is still the low end
      } else skipped.push((p.name || p.type) + ' (' + p.type + (ax && ay && az ? '' : ', rotated') + ')');
    });
    return { model: { name: 'From headset', params: [], features }, skipped };
  }

  const api = { box, cylinder, union, subtract, triangles, watertight, volume, bounds, evalExpr, solveParams, build, fromStarkParts };
  if (typeof module !== 'undefined') module.exports = api; else root.CORE = api;
})(this);
