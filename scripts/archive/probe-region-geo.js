const sel = await eda.pcb_SelectControl.getAllSelectedPrimitives();
const p = Array.isArray(sel) ? sel[0] : sel;
const out = {};
out.id = p.getState_PrimitiveId();
out.type = p.getState_PrimitiveType();
out.layer = p.getState_Layer();
try { out.regionName = p.getState_RegionName(); } catch(e) { out.regionNameErr = String(e); }
try { out.ruleType = p.getState_RuleType(); } catch(e) { out.ruleTypeErr = String(e); }

const cp = p.getState_ComplexPolygon();
out.cpProto = Object.getPrototypeOf(cp)?.constructor?.name;
out.cpKeys = cp ? Object.keys(cp).slice(0, 20) : null;
let pr = cp; const ns = new Set();
while (pr && pr !== Object.prototype) { for (const n of Object.getOwnPropertyNames(pr)) ns.add(n); pr = Object.getPrototypeOf(pr); }
out.cpMethods = [...ns].filter(n => { try { return typeof cp[n]==='function'; } catch { return false; } }).sort();

if (cp && typeof cp.getSource === 'function') {
  try { const src = cp.getSource(); out.sourceIsArray = Array.isArray(src); out.sourceLen = Array.isArray(src) ? src.length : null; out.sourceHead = Array.isArray(src) ? src.slice(0, 200) : String(src).slice(0, 1500); } catch(e) { out.sourceErr = String(e); }
}
if (cp && typeof cp.getCenter === 'function') { try { out.center = cp.getCenter(); } catch(e) { out.centerErr = String(e); } }
return out;
