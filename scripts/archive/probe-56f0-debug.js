const asNum = (v) => typeof v === 'number' ? v : NaN;
const parseSource = (s) => { if (!Array.isArray(s) || s.length === 0) return []; if (s[0] === 'R' || s[0] === 'CIRCLE') return []; const pts = []; let i = 0; const x0 = asNum(s[0]), y0 = asNum(s[1]); if (!Number.isNaN(x0) && !Number.isNaN(y0)) { pts.push({ x: x0, y: y0 }); i = 2; } while (i < s.length) { const cmd = s[i]; i++; if (cmd === 'L') { while (i + 1 < s.length && typeof s[i] === 'number' && typeof s[i + 1] === 'number') { pts.push({ x: s[i], y: s[i + 1] }); i += 2; } } else break; } return pts; };
const recognizeLoops = (segments) => {
  const vPts = []; const adj = new Map();
  const getV = (p) => { for (let i = 0; i < vPts.length; i++) { if (Math.hypot(vPts[i].x - p.x, vPts[i].y - p.y) < 5) return i; } vPts.push(p); return vPts.length - 1; };
  const debug = { vPts: [], edges: [] };
  for (const seg of segments) {
    if (seg.points.length < 2) continue;
    const from = getV(seg.points[0]); const to = getV(seg.points[seg.points.length - 1]);
    const e = { segId: seg.id, from, to };
    debug.edges.push({ segId: seg.id, from, to, firstP: seg.points[0], lastP: seg.points[seg.points.length - 1] });
    if (!adj.has(from)) adj.set(from, []); if (!adj.has(to)) adj.set(to, []);
    adj.get(from).push(e); adj.get(to).push(e);
  }
  debug.vPts = vPts;
  debug.adjDeg = vPts.map((_, i) => ({ v: i, deg: adj.get(i)?.length ?? 0, pt: vPts[i] }));
  const visited = new Set(); const loops = [];
  for (const start of vPts.keys()) {
    if (visited.has(start)) continue;
    const comp = []; const q = [start]; visited.add(start);
    while (q.length) { const v = q.shift(); comp.push(v); for (const e of (adj.get(v) || [])) { const nb = e.from === v ? e.to : e.from; if (!visited.has(nb)) { visited.add(nb); q.push(nb); } } }
    debug['comp_' + start] = { comp, allDeg2: comp.every((v) => (adj.get(v)?.length ?? 0) === 2) };
    if (!comp.every((v) => (adj.get(v)?.length ?? 0) === 2)) continue;
    if (comp.length < 2) continue;
    loops.push({ compLen: comp.length, vertices: comp });
  }
  return { loops, debug };
};

const all = (await eda.pcb_PrimitivePolyline.getAll()) || [];
const ids = ['56f0008d86172561', '16642e37b4f125bd'];
const target = all.filter((p) => ids.includes(p.getState_PrimitiveId()));
const segs = target.map((p) => { const src = p.getState_Polygon()?.getSource?.() ?? p.getState_Polygon()?.polygon; return { id: p.getState_PrimitiveId(), points: parseSource(src) }; });
return { found: target.length, segs: segs.map((s) => ({ id: s.id, pts: s.points.length, first: s.points[0], last: s.points[s.points.length - 1] })), result: recognizeLoops(segs) };
