const out = {};
const polys = (await eda.pcb_PrimitivePolyline.getAll(undefined, 1)) || [];
out.topPolylineCount = polys.length;
const byNet = {};
for (const p of polys) { try { const n = p.getState_Net?.() ?? '(none)'; byNet[n] = (byNet[n] || 0) + 1; } catch {} }
out.byNet = byNet;

// 无 net 的 Polyline：是否闭合（首尾点相同）
const noNet = polys.filter((p) => { try { return !p.getState_Net(); } catch { return false; } });
out.noNetCount = noNet.length;
out.noNetClosed = [];
for (const p of noNet) {
  try {
    const poly = p.getState_Polygon()?.polygon;
    if (!Array.isArray(poly)) continue;
    // 找首个数字对 和 末个数字对
    const nums = poly.filter((v) => typeof v === 'number');
    const firstX = nums[0], firstY = nums[1], lastX = nums[nums.length - 2], lastY = nums[nums.length - 1];
    const closed = Math.abs(firstX - lastX) < 1e-6 && Math.abs(firstY - lastY) < 1e-6;
    out.noNetClosed.push({ id: p.getState_PrimitiveId(), closed, numCount: nums.length, first: [firstX, firstY], last: [lastX, lastY] });
  } catch (e) {}
}
return out;
