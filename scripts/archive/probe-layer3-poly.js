const pol3 = (await eda.pcb_PrimitivePolyline.getAll(undefined, 3)) || [];
return {
  count: pol3.length,
  samples: pol3.slice(0, 6).map(p => {
    const poly = p.getState_Polygon();
    return { id: p.getState_PrimitiveId(), layer: p.getState_Layer?.(), polygon: poly?.polygon };
  }),
};
