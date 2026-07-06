try {
  const d = await eda.pcb_ManufactureData.getManufactureData();
  if (d == null) return { result: 'null/undefined' };
  if (typeof d !== 'object') return { result: String(d).slice(0, 600) };
  const keys = Object.keys(d);
  const out = { topKeys: keys.slice(0, 50) };
  // 找 outline/board/shape 相关键
  out.outlineKeys = keys.filter(k => /outline|board|shape|contour|route|profile/i.test(k));
  for (const k of out.outlineKeys) {
    try { out['val_'+k] = JSON.stringify(d[k]).slice(0, 1200); } catch(e) { out['val_'+k] = 'err:'+String(e); }
  }
  return out;
} catch(e) { return { err: String(e), stack: e?.stack?.slice(0,400) }; }
