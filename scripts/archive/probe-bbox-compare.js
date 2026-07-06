return {
  e763_layer3_sameGeoAs_e102: await eda.pcb_Primitive.getPrimitivesBBox(['e763']),
  e765_layer3: await eda.pcb_Primitive.getPrimitivesBBox(['e765']),
  e102_layer11: await eda.pcb_Primitive.getPrimitivesBBox(['e102']),
  poly510614_layer11: await eda.pcb_Primitive.getPrimitivesBBox(['5106142228bfb93b']),
  e763_layer: (await eda.pcb_PrimitivePolyline.get(['e763']))?.getState_Layer?.(),
  note: "e763(layer3) 与 e102(layer11) 几何完全相同(都来自 getState_Polygon)，对比 bbox 是否相同",
};
