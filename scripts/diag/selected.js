// 读取当前手动选中的图元，分析为何没被识别为板框。
const safe = (fn) => { try { return fn(); } catch (e) { return undefined; } };
const out = {};
let sel = [];
try { sel = (await eda.pcb_SelectControl.getAllSelectedPrimitives()) ?? []; } catch (e) { out.selErr = String(e); }
out.selCount = sel.length;
const items = [];
for (const p of sel) {
  const item = {
    id: safe(() => p.getState_PrimitiveId()),
    type: safe(() => p.getState_PrimitiveType()),
    layer: safe(() => (typeof p.getState_Layer === 'function' ? p.getState_Layer() : undefined)),
    net: safe(() => (typeof p.getState_Net === 'function' ? p.getState_Net() : undefined)),
    regionName: safe(() => (typeof p.getState_RegionName === 'function' ? p.getState_RegionName() : undefined)),
  };
  try {
    const poly = typeof p.getState_Polygon === 'function' ? p.getState_Polygon() : undefined;
    const src = poly && typeof poly.getSource === 'function' ? poly.getSource() : undefined;
    if (Array.isArray(src)) {
      item.src = src.slice(0, 30);
      const nums = []; for (const t of src) { if (typeof t === 'number') nums.push(t); }
      if (nums.length >= 4) {
        const fx = nums[0], fy = nums[1], lx = nums[nums.length - 2], ly = nums[nums.length - 1];
        item.first = { x: fx, y: fy };
        item.last = { x: lx, y: ly };
        item.endGap = Math.round(Math.hypot(fx - lx, fy - ly) * 100) / 100;
      }
    }
  } catch (e) { item.srcErr = String(e); }
  try {
    if (typeof p.getState_StartX === 'function') {
      item.start = { x: p.getState_StartX(), y: p.getState_StartY() };
      item.end = { x: p.getState_EndX(), y: p.getState_EndY() };
      item.arcAngle = typeof p.getState_ArcAngle === 'function' ? p.getState_ArcAngle() : undefined;
    }
  } catch (e) {}
  items.push(item);
}
out.items = items;
return out;
