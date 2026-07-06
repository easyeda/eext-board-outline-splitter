const lines = ((await eda.pcb_PrimitiveLine.getAll()) || []).filter((l) => { try { return l.getState_Layer() === 1; } catch { return false; } });
const arcs = ((await eda.pcb_PrimitiveArc.getAll()) || []).filter((a) => { try { return a.getState_Layer() === 1; } catch { return false; } });
return {
  topLineCount: lines.length,
  topLines: lines.map((l) => ({ id: l.getState_PrimitiveId(), net: l.getState_Net?.(), start: [l.getState_StartX(), l.getState_StartY()], end: [l.getState_EndX(), l.getState_EndY()] })),
  topArcCount: arcs.length,
  topArcs: arcs.map((a) => ({ id: a.getState_PrimitiveId(), net: a.getState_Net?.(), start: [a.getState_StartX(), a.getState_StartY()], end: [a.getState_EndX(), a.getState_EndY()], ang: a.getState_ArcAngle() })),
};
