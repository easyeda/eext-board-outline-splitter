function parseSource(s) {
  if (!Array.isArray(s)) return { kind: 'unknown', raw: s };
  const cmd = s[0];
  if (cmd === 'R') {
    const x = s[1], y = s[2], w = s[3], h = s[4];
    return { kind: 'rect', corners: [[x,y],[x+w,y],[x+w,y-h],[x,y-h]] };
  }
  if (cmd === 'CIRCLE') {
    const cx = s[1], cy = s[2], r = s[3];
    const pts = [];
    for (let i = 0; i < 36; i++) { const a = (i/36)*2*Math.PI; pts.push([Math.round(cx+r*Math.cos(a)), Math.round(cy+r*Math.sin(a))]); }
    return { kind: 'circle', center: [cx,cy], r, samplePts: pts.slice(0,4) };
  }
  return { kind: 'other', cmd };
}

const out = { boards: [] };
const list = (await eda.pcb_PrimitivePolyline.getAll(undefined, 11)) || [];
const ids = list.map(p => p.getState_PrimitiveId());
out.enumIds = ids;

await eda.pcb_SelectControl.clearSelected();
await eda.pcb_SelectControl.doSelectPrimitives(ids);
const sel = await eda.pcb_SelectControl.getAllSelectedPrimitives();
const arr = Array.isArray(sel) ? sel : (sel ? [sel] : []);
for (const p of arr) {
  const b = {};
  b.id = p.getState_PrimitiveId();
  b.type = p.getState_PrimitiveType();
  b.regionName = p.getState_RegionName?.();
  const src = p.getState_ComplexPolygon().getSource();
  b.source = src;
  b.parsed = parseSource(src);
  b.bbox = await eda.pcb_Primitive.getPrimitivesBBox([b.id]);
  out.boards.push(b);
}
await eda.pcb_SelectControl.clearSelected();
return out;
