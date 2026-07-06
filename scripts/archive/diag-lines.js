// 诊断顶层无网络线条为何没拼成闭合拟合板框。
// 输出：直成环数 vs 进多段拟合数、拟合段端点+间隙、顶点度数分布、奇点（度数!=2 即失败根因）。
const out = {};
const TOL = 5;
const rnd = (p) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 });

function parseEnds(src) {
  if (!Array.isArray(src)) return null;
  const nums = [];
  for (const t of src) { if (typeof t === 'number' && isFinite(t)) nums.push(t); }
  if (nums.length < 4) return null;
  return { first: { x: nums[0], y: nums[1] }, last: { x: nums[nums.length - 2], y: nums[nums.length - 1] } };
}

const items = [];

const polys = (await eda.pcb_PrimitivePolyline.getAll()) ?? [];
for (const p of polys) {
  try {
    if (p.getState_Layer() !== 1) continue;
    const net = typeof p.getState_Net === 'function' ? p.getState_Net() : undefined;
    if (net) continue;
    const id = p.getState_PrimitiveId();
    const poly = p.getState_Polygon();
    const src = poly && typeof poly.getSource === 'function' ? poly.getSource() : poly?.polygon;
    const cmd = Array.isArray(src) ? src[0] : null;
    items.push({ kind: 'POLY', id, cmd, ends: parseEnds(src) });
  } catch (e) { items.push({ kind: 'POLY', err: String(e) }); }
}

const arcs = (await eda.pcb_PrimitiveArc.getAll()) ?? [];
for (const a of arcs) {
  try {
    if (a.getState_Layer() !== 1) continue;
    const net = typeof a.getState_Net === 'function' ? a.getState_Net() : undefined;
    if (net) continue;
    const id = a.getState_PrimitiveId();
    const first = { x: a.getState_StartX(), y: a.getState_StartY() };
    const last = { x: a.getState_EndX(), y: a.getState_EndY() };
    items.push({ kind: 'ARC', id, cmd: 'ARC', ends: { first, last } });
  } catch (e) { items.push({ kind: 'ARC', err: String(e) }); }
}

out.total = items.length;

const whole = [];
const fit = [];
for (const it of items) {
  if (!it.ends) { it.skipped = 'no-ends'; continue; }
  const { first, last } = it.ends;
  const gap = Math.hypot(first.x - last.x, first.y - last.y);
  it.gap = Math.round(gap * 100) / 100;
  it.isWhole = it.cmd === 'CIRCLE' || it.cmd === 'R';
  it.endsMeet = gap < TOL;
  if (it.isWhole || it.endsMeet) whole.push(it);
  else fit.push(it);
}
out.wholeCount = whole.length;
out.fitCount = fit.length;
out.whole = whole.map((i) => ({ id: i.id, cmd: i.cmd, gap: i.gap, why: i.isWhole ? 'whole' : 'endsMeet' }));

const vPts = [];
const getV = (pt) => {
  for (let i = 0; i < vPts.length; i++) {
    if (Math.hypot(vPts[i].x - pt.x, vPts[i].y - pt.y) < TOL) return i;
  }
  vPts.push({ x: pt.x, y: pt.y, deg: 0, segs: [] });
  return vPts.length - 1;
};
for (const s of fit) {
  const f = getV(s.ends.first);
  const t = getV(s.ends.last);
  vPts[f].deg++;
  vPts[f].segs.push(s.id);
  if (t !== f) { vPts[t].deg++; vPts[t].segs.push(s.id); }
}
const byDeg = {};
for (const v of vPts) byDeg[v.deg] = (byDeg[v.deg] || 0) + 1;
out.vertexCount = vPts.length;
out.degDist = byDeg;
out.oddVerts = vPts.filter((v) => v.deg !== 2).map((v) => ({ xy: rnd(v), deg: v.deg, segs: v.segs }));
out.fitSegs = fit.map((s) => ({ id: s.id, cmd: s.cmd, gap: s.gap, first: rnd(s.ends.first), last: rnd(s.ends.last) }));

return out;
