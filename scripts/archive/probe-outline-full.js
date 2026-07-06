const out = {};
const pol11 = (await eda.pcb_PrimitivePolyline.getAll(undefined, 11)) || [];
out.polylines = [];
for (const p of pol11) {
  const id = p.getState_PrimitiveId();
  const poly = p.getState_Polygon();
  let center = null;
  try { center = typeof poly.getCenter === 'function' ? poly.getCenter() : null; } catch(e) { center = 'err:'+String(e); }
  let bbox = null;
  try { bbox = await eda.pcb_Primitive.getPrimitivesBBox([id]); } catch(e) { bbox = 'err:'+String(e); }
  out.polylines.push({ id, center, bbox, fullSource: poly.getSource() });
}

// 组件包围盒范围（对比板框位置）
const comps = (await eda.pcb_PrimitiveComponent.getAll()) || [];
let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;
for (const c of comps) { try { const x=c.getState_X(), y=c.getState_Y(); if(x<minx)minx=x; if(x>maxx)maxx=x; if(y<miny)miny=y; if(y>maxy)maxy=y; } catch{} }
out.compBBox = { minx, miny, maxx, maxy };

// 尝试 board 信息
try { out.boardInfo = await eda.dmt_Board.getBoardInfo('波形变换电路'); } catch(e) { out.boardInfoErr = String(e); }
return out;
