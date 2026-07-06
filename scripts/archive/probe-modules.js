const out = {};
out.pcbModules = Object.keys(eda).filter(k => k.startsWith('pcb_')).sort();
out.dmtModules = Object.keys(eda).filter(k => k.startsWith('dmt_')).sort();
out.boardRelated = Object.keys(eda).filter(k => /board|outline|shape/i.test(k)).sort();
const l1 = (await eda.pcb_PrimitiveLine.getAll(undefined, 1)) || [];
out.lineLayer1Count = l1.length;
const l11 = (await eda.pcb_PrimitiveLine.getAll(undefined, 11)) || [];
out.lineLayer11Count = l11.length;
return out;
