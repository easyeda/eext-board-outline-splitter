const out = {};
const pol3 = (await eda.pcb_PrimitivePolyline.getAll(undefined, 3)) || [];
out.layer3Total = pol3.length;
out.layer3big = [];
for (const p of pol3) {
  const id = p.getState_PrimitiveId();
  let bb; try { bb = await eda.pcb_Primitive.getPrimitivesBBox([id]); } catch {}
  if (bb && (bb.maxX - bb.minX) > 800 && (bb.maxY - bb.minY) > 800) {
    out.layer3big.push({ id, bb, polygon: p.getState_Polygon()?.polygon });
  }
}
// 所有 layer 的大轮廓候选（遍历 line/polyline 在各层，找覆盖器件区的）
const allPolylines = (await eda.pcb_PrimitivePolyline.getAll()) || [];
const perLayer = {};
for (const p of allPolylines) {
  try { const ly = p.getState_Layer(); (perLayer[ly] = perLayer[ly]||[]).push(p.getState_PrimitiveId()); } catch {}
}
out.polylinePerLayer = perLayer;

// ManufactureData 方法（制造数据含 BoardOutline）
const m = eda.pcb_ManufactureData;
let pr = m; const ns = new Set();
while (pr && pr !== Object.prototype) { for (const n of Object.getOwnPropertyNames(pr)) ns.add(n); pr = Object.getPrototypeOf(pr); }
out.manufMethods = [...ns].filter(n => { try { return typeof m[n]==='function'; } catch { return false; } }).sort();
return out;
