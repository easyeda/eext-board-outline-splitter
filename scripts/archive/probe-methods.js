const methods = (obj) => {
  if (!obj) return [];
  let pr = obj; const ns = new Set();
  while (pr && pr !== Object.prototype) { for (const n of Object.getOwnPropertyNames(pr)) ns.add(n); pr = Object.getPrototypeOf(pr); }
  return [...ns].filter(n => { try { return typeof obj[n] === 'function'; } catch { return false; } }).sort();
};
return {
  dmtPcb: methods(eda.dmt_Pcb),
  pcbDocument: methods(eda.pcb_Document),
  pcbPrimitive: methods(eda.pcb_Primitive),
  dmtBoard: methods(eda.dmt_Board),
  pcbMathPolygon: methods(eda.pcb_MathPolygon),
};
