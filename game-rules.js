(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GameRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function canWalk(x, z, boxes, door, radius = 0.52) {
    if (x < -19 || x > 16 || z < -9.2 || z > 16.5) return false;
    if (z < 6.4 && (x < -13.3 || x > 13.3)) return false;
    if (z > 5.45 && z < 6.55 && (x < door.minX + radius || x > door.maxX - radius)) return false;
    return !boxes.some(b => x + radius > b.minX && x - radius < b.maxX && z + radius > b.minZ && z - radius < b.maxZ);
  }

  function inCone(px, pz, ox, oz, angle, range, halfFov) {
    const dx = px - ox, dz = pz - oz;
    if (dx * dx + dz * dz > range * range) return false;
    if (dx * dx + dz * dz < 0.001) return true;
    const diff = Math.atan2(Math.sin(Math.atan2(dx, dz) - angle), Math.cos(Math.atan2(dx, dz) - angle));
    return Math.abs(diff) <= halfFov + 1e-9;
  }

  function screenMove(x, y, offsetX, offsetZ, yaw) {
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const ox = offsetX * cos - offsetZ * sin, oz = offsetX * sin + offsetZ * cos;
    const h = Math.hypot(ox, oz);
    const fx = -ox / h, fz = -oz / h;
    const dx = x * -fz - y * fx, dz = x * fx - y * fz;
    const length = Math.hypot(dx, dz) || 1;
    return { x: dx / length, z: dz / length };
  }

  // Detection always wins, including the frame which would complete the sixth steal.
  function advanceSteal(progress, dt, duration, seen, moving) {
    if (seen) return { outcome: 'caught', progress };
    if (moving) return { outcome: 'cancelled', progress: 0 };
    const next = Math.min(1, progress + Math.max(0, dt) / duration);
    return { outcome: next >= 1 ? 'complete' : 'working', progress: next };
  }

  class Heap {
    constructor() { this.items = []; }
    push(value) {
      const a = this.items; a.push(value);
      let i = a.length - 1;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (a[parent].f <= value.f) break;
        a[i] = a[parent]; i = parent;
      }
      a[i] = value;
    }
    pop() {
      const a = this.items, first = a[0], end = a.pop();
      if (!a.length) return first;
      let i = 0;
      while (i * 2 + 1 < a.length) {
        let child = i * 2 + 1;
        if (child + 1 < a.length && a[child + 1].f < a[child].f) child++;
        if (a[child].f >= end.f) break;
        a[i] = a[child]; i = child;
      }
      a[i] = end; return first;
    }
  }

  class Navigator {
    constructor(walkable, step = 0.5) {
      this.walkable = walkable; this.step = step;
      this.minX = -18.5; this.minZ = -9;
      this.width = Math.floor((16 - this.minX) / step) + 1;
      this.height = Math.floor((16.5 - this.minZ) / step) + 1;
      this.cells = new Uint8Array(this.width * this.height);
      for (let i = 0; i < this.cells.length; i++) {
        const p = this.point(i); this.cells[i] = walkable(p.x, p.z) ? 1 : 0;
      }
    }
    point(i) { return { x: this.minX + (i % this.width) * this.step, z: this.minZ + Math.floor(i / this.width) * this.step }; }
    clear(a, b) {
      const n = Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / 0.12));
      for (let i = 0; i <= n; i++) {
        if (!this.walkable(a.x + (b.x - a.x) * i / n, a.z + (b.z - a.z) * i / n)) return false;
      }
      return true;
    }
    nearest(p) {
      const gx = Math.round((p.x - this.minX) / this.step), gz = Math.round((p.z - this.minZ) / this.step);
      const connect = this.walkable(p.x, p.z);
      let best = -1, distance = Infinity;
      for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
        const x = gx + dx, z = gz + dz;
        if (x < 0 || x >= this.width || z < 0 || z >= this.height) continue;
        const i = z * this.width + x;
        if (!this.cells[i]) continue;
        const q = this.point(i), d = Math.hypot(q.x - p.x, q.z - p.z);
        if (d < distance && (!connect || this.clear(p, q))) { best = i; distance = d; }
      }
      return best;
    }
    findPath(start, goal) {
      const begin = this.nearest(start), end = this.nearest(goal);
      if (begin < 0 || end < 0) return null;
      const target = this.point(end), open = new Heap();
      const costs = new Float64Array(this.cells.length); costs.fill(Infinity);
      const parent = new Int32Array(this.cells.length); parent.fill(-1);
      const closed = new Uint8Array(this.cells.length);
      costs[begin] = 0; open.push({ i: begin, f: 0 });
      while (open.items.length) {
        const { i } = open.pop();
        if (closed[i]) continue;
        if (i === end) {
          const raw = []; let cursor = end;
          while (cursor !== -1) { raw.unshift(this.point(cursor)); cursor = parent[cursor]; }
          if (this.walkable(goal.x, goal.z) && this.clear(raw[raw.length - 1], goal)) raw.push({ x: goal.x, z: goal.z });
          const result = []; let anchor = { x: start.x, z: start.z }, j = 0;
          while (j < raw.length) {
            let furthest = j;
            while (furthest + 1 < raw.length && this.clear(anchor, raw[furthest + 1])) furthest++;
            const p = raw[furthest]; result.push(p); anchor = p; j = furthest + 1;
          }
          return result;
        }
        closed[i] = 1;
        const x = i % this.width, z = Math.floor(i / this.width), a = this.point(i);
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          if ((!dx && !dz) || x + dx < 0 || x + dx >= this.width || z + dz < 0 || z + dz >= this.height) continue;
          const next = (z + dz) * this.width + x + dx;
          if (!this.cells[next] || closed[next]) continue;
          if (dx && dz && (!this.cells[z * this.width + x + dx] || !this.cells[(z + dz) * this.width + x])) continue;
          const b = this.point(next);
          if (!this.clear(a, b)) continue;
          const cost = costs[i] + Math.hypot(dx, dz);
          if (cost >= costs[next]) continue;
          costs[next] = cost; parent[next] = i;
          open.push({ i: next, f: cost + Math.hypot(b.x - target.x, b.z - target.z) / this.step });
        }
      }
      return null;
    }
  }
  return { canWalk, inCone, screenMove, advanceSteal, Navigator };
});
