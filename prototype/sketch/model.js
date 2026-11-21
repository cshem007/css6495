// CSS Design "from scratch": sketch on a plane, extrude, push/pull faces. Pure JS on core.js.
// A feature = a 2D profile (rectangle or circle) on a plane, extruded a distance along the plane's
// normal, either added to the part or cut from it. Numbers are formula strings, like the CAD prototype.
(function (root) {
  const C = (typeof module !== 'undefined') ? require('./core.js') : root.CORE;
  const V = (x, y, z) => ({ x, y, z });
  const add = (a, b) => V(a.x + b.x, a.y + b.y, a.z + b.z), sub = (a, b) => V(a.x - b.x, a.y - b.y, a.z - b.z);
  const mul = (a, s) => V(a.x * s, a.y * s, a.z * s), dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const cross = (a, b) => V(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  const unit = a => { const l = Math.sqrt(dot(a, a)); return l > 0 ? mul(a, 1 / l) : a; };

  // A sketch plane from a face normal and its offset: u runs sideways, v runs "up" where possible.
  function frameFromNormal(n, w) {
    n = unit(n);
    const u = Math.abs(n.z) > .9 ? V(1, 0, 0) : unit(cross(V(0, 0, 1), n));
    const v = cross(n, u);
    const r = a => Math.round(a * 1e6) / 1e6, rv = a => V(r(a.x), r(a.y), r(a.z));
    return { o: rv(mul(n, w)), n: rv(n), u: rv(u), v: rv(v) };
  }
  const GROUND = frameFromNormal(V(0, 0, 1), 0);
  const toWorld = (P, x, y, z) => add(add(add(P.o, mul(P.u, x)), mul(P.v, y)), mul(P.n, z));

  // Move polygons from a plane's local frame (x along u, y along v, z along n) into the model.
  function place(polys, P) {
    return polys.map(q => {
      const v = q.v.map(p => toWorld(P, p.x, p.y, p.z));
      const n = add(add(mul(P.u, q.p.n.x), mul(P.v, q.p.n.y)), mul(P.n, q.p.n.z));
      return { v, p: { n, w: dot(n, v[0]) } };
    });
  }

  function num(f, k, vars) { return C.evalExpr(f[k], vars); }
  // Resolved numbers for a feature (throws on a bad formula).
  function dims(f, vars) {
    const d = { dist: num(f, 'dist', vars) };
    if (f.shape === 'rect') { d.x = num(f, 'x', vars); d.y = num(f, 'y', vars); d.w = num(f, 'w', vars); d.h = num(f, 'h', vars); if (d.w <= 0 || d.h <= 0) throw new Error('width and height must be above 0'); }
    else { d.cx = num(f, 'cx', vars); d.cy = num(f, 'cy', vars); d.r = num(f, 'r', vars); if (d.r <= 0) throw new Error('radius must be above 0'); }
    if (Math.abs(d.dist) < 1e-6) throw new Error('distance cannot be 0');
    return d;
  }
  // A feature's sketch plane: fixed, or attached to a face of an earlier feature ({ ref: { f, face } }),
  // in which case it is recomputed from that face every build, so the sketch follows the face.
  function resolvePlane(f, model, vars, planes) {
    const P = f.plane;
    if (!P || !P.ref) return P;
    const rf = model.features.find(x => x.id === P.ref.f);
    if (!rf || rf.skip || !planes[rf.id]) throw new Error('the face this sketch was on is gone');
    const F = faces(rf, vars, planes[rf.id]).find(x => x.id === P.ref.face && x.kind === 'plane');
    if (!F) throw new Error('the face this sketch was on is gone');
    return frameFromNormal(F.n, Math.round(dot(F.n, F.pt) * 1e4) / 1e4);
  }
  function solid(f, vars, Pin) {
    const d = dims(f, vars), z0 = Math.min(0, d.dist), z1 = Math.max(0, d.dist);
    const local = f.shape === 'rect' ? C.box(d.x, d.y, z0, d.w, d.h, z1 - z0) : C.cylinder(V(d.cx, d.cy, z0), V(d.cx, d.cy, z1), d.r, 48);
    return place(local, Pin || f.plane);
  }

  // The faces of a feature's own shape, for push/pull. Each: id, outward normal (model), a point on it, and
  // how a move of 'delta' mm along that normal changes the feature's numbers.
  function faces(f, vars, Pin) {
    const d = dims(f, vars), P = Pin || f.plane, top = Math.max(0, d.dist), bot = Math.min(0, d.dist), out = [];
    const capTop = { id: 'top', n: P.n, pt: toWorld(P, 0, 0, top), kind: 'plane' };
    const capBot = { id: 'bottom', n: mul(P.n, -1), pt: toWorld(P, 0, 0, bot), kind: 'plane' };
    out.push(capTop, capBot);
    if (f.shape === 'rect') {
      out.push({ id: '+u', n: P.u, pt: toWorld(P, d.x + d.w, 0, 0), kind: 'plane' }, { id: '-u', n: mul(P.u, -1), pt: toWorld(P, d.x, 0, 0), kind: 'plane' },
               { id: '+v', n: P.v, pt: toWorld(P, 0, d.y + d.h, 0), kind: 'plane' }, { id: '-v', n: mul(P.v, -1), pt: toWorld(P, 0, d.y, 0), kind: 'plane' });
    } else out.push({ id: 'side', kind: 'round', axisPt: toWorld(P, d.cx, d.cy, 0), axis: P.n, r: d.r });
    return out;
  }

  // Is the point on or inside this feature's own shape (with a small tolerance)?
  function inside(f, d, pt, P) {
    const rel = sub(pt, P.o), x = dot(rel, P.u), y = dot(rel, P.v), z = dot(rel, P.n), e = .06;
    if (z < Math.min(0, d.dist) - e || z > Math.max(0, d.dist) + e) return false;
    if (f.shape === 'rect') return x >= d.x - e && x <= d.x + d.w + e && y >= d.y - e && y <= d.y + d.h + e;
    return Math.hypot(x - d.cx, y - d.cy) <= d.r + Math.max(e, d.r * .02);
  }
  // Which feature face is at this surface point with this surface normal? Later features win.
  function pickFace(model, vars, pt, nrm, planes) {
    for (let i = model.features.length - 1; i >= 0; i--) {
      const f = model.features[i]; if (f.skip) continue;
      const P = (planes && planes[f.id]) || f.plane; if (!P || P.ref) continue;
      let fs, d; try { fs = faces(f, vars, P); d = dims(f, vars); } catch (e) { continue; }
      if (!inside(f, d, pt, P)) continue;                // coplanar faces of other features must not steal the click
      const sign = f.op === 'cut' ? -1 : 1;          // the wall of a hole faces the other way
      for (const F of fs) {
        if (F.kind === 'plane') {
          if (dot(mul(F.n, sign), nrm) > .999 && Math.abs(dot(F.n, sub(pt, F.pt))) < .05) return { f, face: F };
        } else {
          const rel = sub(pt, F.axisPt), along = dot(rel, F.axis), radial = sub(rel, mul(F.axis, along)), dist = Math.sqrt(dot(radial, radial));
          if (Math.abs(dist - F.r) < Math.max(.15, F.r * .02) && Math.abs(dot(nrm, F.axis)) < .05 && dot(unit(radial), nrm) * sign > .9) return { f, face: Object.assign({}, F, { n: unit(radial) }) };
        }
      }
    }
    return null;
  }

  const r1 = v => String(Math.round(v * 10) / 10);
  // Push/pull: move face 'id' of feature f by delta mm along the face's OUTWARD normal (of the feature's own shape).
  function applyDelta(f, id, delta, base) { // base = dims at drag start
    const g = Object.assign({}, f), P = f.plane;
    if (id === 'top') g.dist = r1(base.dist >= 0 ? base.dist + delta : base.dist);
    if (id === 'bottom') {
      if (base.dist >= 0) { g.plane = shiftPlane(base.plane, -delta); g.dist = r1(base.dist + delta); }
      else g.dist = r1(base.dist - delta);
    }
    if (id === 'top' && base.dist < 0) { g.plane = shiftPlane(base.plane, delta); g.dist = r1(base.dist - delta); }
    if (id === '+u') g.w = r1(base.w + delta);
    if (id === '-u') { g.x = r1(base.x - delta); g.w = r1(base.w + delta); }
    if (id === '+v') g.h = r1(base.h + delta);
    if (id === '-v') { g.y = r1(base.y - delta); g.h = r1(base.h + delta); }
    if (id === 'side') g.r = r1(base.r + delta);
    return g;
  }
  function shiftPlane(P, by) { return { o: add(P.o, mul(P.n, by)), n: P.n, u: P.u, v: P.v }; }

  function build(model) {
    const { vars, values, errors: paramErrors } = C.solveParams(model.params || []);
    let part = []; const errors = {}, own = {}, planes = {};
    for (const f of model.features) {
      if (f.skip) continue;
      try {
        const P = resolvePlane(f, model, vars, planes); planes[f.id] = P;
        const s = solid(f, vars, P); own[f.id] = s;
        part = f.op === 'cut' ? (part.length ? C.subtract(part, s) : part) : (part.length ? C.union(part, s) : s);
      } catch (e) { errors[f.id] = e.message; }
    }
    return { solid: part, errors, own, planes, vars, values, paramErrors };
  }

  const api = { V, frameFromNormal, GROUND, toWorld, place, dims, solid, faces, pickFace, resolvePlane, applyDelta, build, dot, cross, sub, add, mul, unit };
  if (typeof module !== 'undefined') module.exports = api; else root.SKETCH = api;
})(this);
