const id = '77381e7e10b15e43';
const out = { id };
const types = { Line: 'pcb_PrimitiveLine', Arc: 'pcb_PrimitiveArc', Polyline: 'pcb_PrimitivePolyline', Region: 'pcb_PrimitiveRegion', Fill: 'pcb_PrimitiveFill', Pour: 'pcb_PrimitivePour', Dimension: 'pcb_PrimitiveDimension', String: 'pcb_PrimitiveString', Image: 'pcb_PrimitiveImage', Component: 'pcb_PrimitiveComponent', Pad: 'pcb_PrimitivePad', Via: 'pcb_PrimitiveVia', Attribute: 'pcb_PrimitiveAttribute' };
for (const [t, m] of Object.entries(types)) {
  try {
    const a = (await eda[m].getAll()) || [];
    const found = a.find((p) => { try { return p.getState_PrimitiveId() === id; } catch { return false; } });
    if (found) {
      out.foundIn = t;
      try { out.type = found.getState_PrimitiveType(); } catch (e) { out.typeErr = String(e); }
      try { out.layer = found.getState_Layer?.(); } catch (e) { out.layerErr = String(e); }
      try { out.net = found.getState_Net?.(); } catch {}
      try { out.name = found.getState_RegionName?.(); } catch {}
      try { out.cpSrc = found.getState_ComplexPolygon?.()?.getSource?.(); } catch {}
      try { out.poly = found.getState_Polygon?.()?.polygon ?? found.getState_Polygon?.(); } catch {}
      // 列出方法
      let pr = found; const ns = new Set();
      while (pr && pr !== Object.prototype) { for (const n of Object.getOwnPropertyNames(pr)) ns.add(n); pr = Object.getPrototypeOf(pr); }
      out.stateMethods = [...ns].filter((n) => { try { return typeof found[n] === 'function' && n.startsWith('getState'); } catch { return false; } }).sort();
      break;
    }
  }
  catch { /* ignore */ }
}
return out;
