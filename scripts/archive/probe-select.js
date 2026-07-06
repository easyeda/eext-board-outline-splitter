const out = {};
const sc = eda.pcb_SelectControl;
let pr = sc; const ns = new Set();
while (pr && pr !== Object.prototype) { for (const n of Object.getOwnPropertyNames(pr)) ns.add(n); pr = Object.getPrototypeOf(pr); }
out.selectMethods = [...ns].filter(n => { try { return typeof sc[n]==='function'; } catch { return false; } }).sort();
// 当前是否已有选中
try { out.currentSelected = await sc.getAllSelectedPrimitives_PrimitiveId(); } catch(e) { out.curSelErr = String(e); }
return out;
