const pol11 = (await eda.pcb_PrimitivePolyline.getAll(undefined, 11)) || [];
return pol11.map(p => {
  const poly = p.getState_Polygon();
  const inner = poly?.polygon;
  const info = {};
  if (inner != null) {
    info.isArray = Array.isArray(inner);
    info.length = Array.isArray(inner) ? inner.length : null;
    if (Array.isArray(inner)) {
      info.firstElems = inner.slice(0, 40);
      if (inner[0] != null) {
        info.elem0kind = Array.isArray(inner[0]) ? 'array' : typeof inner[0];
        if (Array.isArray(inner[0])) info.elem0 = inner[0].slice(0, 6);
      }
    } else {
      info.ownKeys = Object.keys(inner).slice(0, 40);
      info.protoName = Object.getPrototypeOf(inner)?.constructor?.name;
      let pr = inner; const ns = new Set();
      while (pr && pr !== Object.prototype) { for (const n of Object.getOwnPropertyNames(pr)) ns.add(n); pr = Object.getPrototypeOf(pr); }
      info.methods = [...ns].filter(n => { try { return typeof inner[n]==='function'; } catch { return false; } }).slice(0,40);
    }
  }
  return { id: p.getState_PrimitiveId(), innerInfo: info };
});
