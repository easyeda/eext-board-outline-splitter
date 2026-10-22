"use strict";
var edaEsbuildExportName = (() => {
  // src/core/types.ts
  var EPS = 0.01;
  var BOARD_OUTLINE_LAYER = 11;

  // src/core/geometry.ts
  function bboxOf(points) {
    if (points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    let minX = points[0].x;
    let minY = points[0].y;
    let maxX = points[0].x;
    let maxY = points[0].y;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY };
  }
  function bboxCenter(b) {
    return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  }
  function bboxContainsBox(outer, inner, eps = EPS) {
    return inner.minX > outer.minX + eps && inner.maxX < outer.maxX - eps && inner.minY > outer.minY + eps && inner.maxY < outer.maxY - eps;
  }
  function isPointOnSegment(p, a, b, eps = EPS) {
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(cross) > eps * Math.max(1, Math.hypot(b.x - a.x, b.y - a.y))) return false;
    const dot = (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y);
    if (dot < -eps) return false;
    const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    return dot <= len2 + eps;
  }
  function pointInPolygon(p, ring) {
    const n = ring.length;
    if (n < 3) return false;
    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const pi = ring[i];
      const pj = ring[j];
      if (isPointOnSegment(p, pj, pi)) return true;
      if (pi.y > p.y !== pj.y > p.y) {
        const xCross = (pj.x - pi.x) * (p.y - pi.y) / (pj.y - pi.y) + pi.x;
        if (p.x < xCross) inside = !inside;
      }
    }
    return inside;
  }
  function pointInBoard(p, outer, holes) {
    if (!pointInPolygon(p, outer)) return false;
    for (const h of holes) {
      if (pointInPolygon(p, h)) return false;
    }
    return true;
  }
  function polygonContainsPolygon(outer, inner) {
    for (const p of inner) {
      if (!pointInPolygon(p, outer)) return false;
    }
    return true;
  }
  function segmentsIntersect(p1, p2, p3, p4) {
    const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
    if (Math.abs(d) < EPS) return false;
    const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
    const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
    return t > EPS && t < 1 - EPS && u > EPS && u < 1 - EPS;
  }
  function ringsIntersect(a, b) {
    const edges = (r) => {
      const es = [];
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) es.push([r[j], r[i]]);
      return es;
    };
    const ea = edges(a);
    const eb = edges(b);
    for (const [p1, p2] of ea) {
      for (const [p3, p4] of eb) {
        if (segmentsIntersect(p1, p2, p3, p4)) return true;
      }
    }
    return false;
  }
  function discretizeArc(start, end, angleDeg, segmentsPerCircle = 36) {
    const chordDx = end.x - start.x;
    const chordDy = end.y - start.y;
    const chord = Math.hypot(chordDx, chordDy);
    if (chord < EPS) return [start];
    const absAng = Math.abs(angleDeg) * Math.PI / 180;
    if (absAng < EPS) return [start, end];
    const radius = chord / (2 * Math.sin(absAng / 2));
    const mx = (start.x + end.x) / 2;
    const my = (start.y + end.y) / 2;
    const perpX = -chordDy / chord;
    const perpY = chordDx / chord;
    const centerDist = radius * Math.cos(absAng / 2);
    const sign = angleDeg > 0 ? 1 : -1;
    const cx = mx + sign * perpX * centerDist;
    const cy = my + sign * perpY * centerDist;
    const sa = Math.atan2(start.y - cy, start.x - cx);
    const n = Math.max(2, Math.ceil(absAng / (2 * Math.PI) * segmentsPerCircle));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = sa + sign * absAng * t;
      pts.push({ x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) });
    }
    return pts;
  }
  function isCircleLike(points, bbox) {
    const w = bbox.maxX - bbox.minX;
    const h = bbox.maxY - bbox.minY;
    if (points.length < 8) return false;
    if (Math.abs(w - h) > Math.max(w, h) * 0.05) return false;
    const cx = (bbox.minX + bbox.maxX) / 2;
    const cy = (bbox.minY + bbox.maxY) / 2;
    const r = (w + h) / 4;
    for (const p of points) {
      if (Math.abs(Math.hypot(p.x - cx, p.y - cy) - r) > r * 0.05) return false;
    }
    return true;
  }

  // src/core/polygon-parse.ts
  function parsePolygonSource(src) {
    if (!Array.isArray(src) || src.length === 0) return [];
    const head = src[0];
    if (head === "R") return rectPoints(src);
    if (head === "CIRCLE") return circlePoints(src);
    return pathPoints(src);
  }
  var asNum = (v) => typeof v === "number" ? v : NaN;
  function rectPoints(src) {
    const x = asNum(src[1]), y = asNum(src[2]), w = asNum(src[3]), h = asNum(src[4]);
    const rot = asNum(src[5]);
    if ([x, y, w, h].some(Number.isNaN)) return [];
    let pts = [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y - h },
      { x, y: y - h }
    ];
    if (!Number.isNaN(rot) && Math.abs(rot) > 1e-6) {
      const cx = x + w / 2, cy = y - h / 2;
      const rad = rot * Math.PI / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      pts = pts.map((p) => ({
        x: cx + (p.x - cx) * cos - (p.y - cy) * sin,
        y: cy + (p.x - cx) * sin + (p.y - cy) * cos
      }));
    }
    return pts;
  }
  function circlePoints(src) {
    const cx = asNum(src[1]), cy = asNum(src[2]), r = asNum(src[3]);
    if ([cx, cy, r].some(Number.isNaN) || r <= 0) return [];
    const N = 72;
    const pts = [];
    for (let i = 0; i < N; i++) {
      const a = i / N * Math.PI * 2;
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
    return pts;
  }
  function pathPoints(src) {
    const pts = [];
    let i = 0;
    const x0 = asNum(src[0]), y0 = asNum(src[1]);
    if (!Number.isNaN(x0) && !Number.isNaN(y0)) {
      pts.push({ x: x0, y: y0 });
      i = 2;
    }
    const last = () => pts[pts.length - 1];
    const isNum = (v) => typeof v === "number";
    while (i < src.length) {
      const cmd = src[i];
      i++;
      if (cmd === "L") {
        while (i + 1 < src.length && isNum(src[i]) && isNum(src[i + 1])) {
          pts.push({ x: src[i], y: src[i + 1] });
          i += 2;
        }
      } else if (cmd === "ARC" || cmd === "CARC") {
        const ang = src[i], ex = src[i + 1], ey = src[i + 2];
        i += 3;
        pts.push(...discretizeArc2(last(), { x: ex, y: ey }, ang));
      } else if (cmd === "C") {
        while (i + 5 < src.length && [0, 1, 2, 3, 4, 5].every((k) => isNum(src[i + k]))) {
          const c1 = { x: src[i], y: src[i + 1] };
          const c2 = { x: src[i + 2], y: src[i + 3] };
          const end = { x: src[i + 4], y: src[i + 5] };
          i += 6;
          pts.push(...discretizeBezier(last(), c1, c2, end));
        }
      } else {
        break;
      }
    }
    return dedupeClose(pts);
  }
  function discretizeArc2(start, end, sweepDeg) {
    if (!start || [start.x, start.y, end?.x, end?.y, sweepDeg].some((v) => typeof v !== "number" || Number.isNaN(v))) return [];
    const sweep = sweepDeg * Math.PI / 180;
    if (Math.abs(sweep) < 1e-9) return [end];
    const dx = end.x - start.x, dy = end.y - start.y;
    const chord = Math.hypot(dx, dy);
    if (chord < 1e-9) return [end];
    const half = sweep / 2;
    const sinHalf = Math.sin(half);
    if (Math.abs(sinHalf) < 1e-6) return [end];
    const r = Math.abs(chord / (2 * sinHalf));
    const mx = (start.x + end.x) / 2, my = (start.y + end.y) / 2;
    const nx = -dy / chord, ny = dx / chord;
    const off = r * Math.cos(half);
    const sgn = sweep >= 0 ? 1 : -1;
    const cx = mx + nx * off * sgn;
    const cy = my + ny * off * sgn;
    const a0 = Math.atan2(start.y - cy, start.x - cx);
    const N = Math.max(4, Math.ceil(Math.abs(sweepDeg) / 10));
    const pts = [];
    for (let k = 1; k <= N; k++) {
      const a = a0 + sweep * (k / N);
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
    return pts;
  }
  function discretizeBezier(p0, c1, c2, p3) {
    const N = 16;
    const pts = [];
    for (let k = 1; k <= N; k++) {
      const t = k / N, mt = 1 - t;
      pts.push({
        x: mt * mt * mt * p0.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * p3.x,
        y: mt * mt * mt * p0.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * p3.y
      });
    }
    return pts;
  }
  function dedupeClose(pts) {
    if (pts.length > 1) {
      const a = pts[0], b = pts[pts.length - 1];
      if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6) pts.pop();
    }
    return pts;
  }

  // src/core/nesting.ts
  function classifyBoards(outlines, cutouts) {
    if (outlines.length === 0) {
      return { boards: [], warning: { abort: false } };
    }
    const n = outlines.length;
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        const A = outlines[a], B = outlines[b];
        const aInB = bboxContainsBox(B.bbox, A.bbox) && polygonContainsPolygon(B.points, A.points);
        const bInA = bboxContainsBox(A.bbox, B.bbox) && polygonContainsPolygon(A.points, B.points);
        if (aInB || bInA) {
          return { boards: [], warning: { abort: true, reason: "\u68C0\u6D4B\u5230\u4E00\u4E2A\u677F\u6846\u5B8C\u5168\u4F4D\u4E8E\u53E6\u4E00\u4E2A\u677F\u6846\u5185\u90E8\uFF0C\u7591\u4F3C\u591A\u677F\u6846\u5D4C\u5957\uFF0C\u5DF2\u4E2D\u6B62\u3002\u8BF7\u6539\u4E3A\u5E76\u6392\u6392\u5217\u591A\u4E2A\u677F\u6846\u3002" } };
        }
        if (ringsIntersect(A.points, B.points)) {
          return { boards: [], warning: { abort: true, reason: "\u68C0\u6D4B\u5230\u4E24\u4E2A\u677F\u6846\u8F6E\u5ED3\u76F8\u4EA4\uFF0C\u65E0\u6CD5\u786E\u5B9A\u5F52\u5C5E\uFF0C\u5DF2\u4E2D\u6B62\u3002" } };
        }
      }
    }
    const holesOf = /* @__PURE__ */ new Map();
    const orphanCount = cutouts.length;
    let placed = 0;
    for (const c of cutouts) {
      let best = null;
      let bestArea = Infinity;
      for (let i = 0; i < n; i++) {
        const o = outlines[i];
        if (bboxContainsBox(o.bbox, c.bbox) && polygonContainsPolygon(o.points, c.points)) {
          const area = (o.bbox.maxX - o.bbox.minX) * (o.bbox.maxY - o.bbox.minY);
          if (area < bestArea) {
            bestArea = area;
            best = i;
          }
        }
      }
      if (best != null) {
        const arr = holesOf.get(best) ?? [];
        arr.push(c);
        holesOf.set(best, arr);
        placed++;
      }
    }
    const indexed = outlines.map((l, i) => ({ l, i, c: bboxCenter(l.bbox) }));
    indexed.sort((a, b) => a.c.x - b.c.x || b.c.y - a.c.y);
    const boards2 = indexed.map((t, idx) => ({
      index: idx + 1,
      outer: t.l,
      holes: holesOf.get(t.i) ?? [],
      center: t.c
    }));
    const warning = { abort: false };
    if (placed < orphanCount) {
      warning.reason = `${orphanCount - placed} \u4E2A\u6316\u5B54\u4E0D\u5728\u4EFB\u4F55\u677F\u6846\u5185\uFF0C\u5DF2\u5FFD\u7565\u3002`;
    }
    return { boards: boards2, warning };
  }

  // src/core/region-collect.ts
  function decideKeep(input) {
    const { outer, holes, allIds, repPoints, forceKeepIds } = input;
    const keep = new Set(forceKeepIds);
    for (const id of allIds) {
      if (keep.has(id)) continue;
      const rep = repPoints.get(id);
      if (!rep) {
        keep.add(id);
        continue;
      }
      if (pointInBoard(rep, outer, holes)) {
        keep.add(id);
      }
    }
    const deleteIds = allIds.filter((id) => !keep.has(id));
    return { keep, deleteIds };
  }

  // src/core/eda/selection.ts
  async function clearSelected() {
    try {
      await eda.pcb_SelectControl.clearSelected();
    } catch (e) {
      console.warn("clearSelected failed:", e);
    }
  }
  async function doSelectPrimitives(ids) {
    try {
      return await eda.pcb_SelectControl.doSelectPrimitives(ids);
    } catch (e) {
      console.warn("doSelectPrimitives failed:", e);
      return false;
    }
  }
  async function getAllSelectedPrimitives() {
    try {
      const sel = await eda.pcb_SelectControl.getAllSelectedPrimitives();
      return Array.isArray(sel) ? sel : sel ? [sel] : [];
    } catch (e) {
      console.warn("getAllSelectedPrimitives failed:", e);
      return [];
    }
  }
  async function getBBox(ids) {
    try {
      const bb = await eda.pcb_Primitive.getPrimitivesBBox(ids);
      if (bb && typeof bb.minX === "number" && typeof bb.maxX === "number") return bb;
      return void 0;
    } catch (e) {
      console.warn("getPrimitivesBBox failed:", e);
      return void 0;
    }
  }

  // src/core/eda/pcb.ts
  async function getCurrentPcbInfo() {
    try {
      const info = await eda.dmt_Pcb.getCurrentPcbInfo();
      if (!info) return void 0;
      return { uuid: info.uuid, name: info.name };
    } catch (e) {
      console.warn("getCurrentPcbInfo failed:", e);
      return void 0;
    }
  }
  async function getAllPcbsInfo() {
    try {
      const all = await eda.dmt_Pcb.getAllPcbsInfo() ?? [];
      return all.map((p) => ({ uuid: p.uuid, name: p.name, parentBoardName: p.parentBoardName }));
    } catch (e) {
      console.warn("getAllPcbsInfo failed:", e);
      return [];
    }
  }
  async function findFreePcbByName(name) {
    const all = await getAllPcbsInfo();
    return all.find((p) => p.name === name && !p.parentBoardName);
  }
  async function waitForFreePcbGone(name, maxTries = 20) {
    for (let i = 0; i < maxTries; i++) {
      const existing = await findFreePcbByName(name);
      if (!existing) return true;
      await new Promise((r) => setTimeout(r, 200));
    }
    return false;
  }
  async function copyPcbFree(srcUuid) {
    try {
      const r = await eda.dmt_Pcb.copyPcb(srcUuid);
      return typeof r === "string" ? r : void 0;
    } catch (e) {
      console.warn("copyPcb failed:", e);
      return void 0;
    }
  }
  async function modifyPcbName(uuid, name) {
    try {
      return await eda.dmt_Pcb.modifyPcbName(uuid, name);
    } catch (e) {
      console.warn("modifyPcbName failed:", e);
      return false;
    }
  }
  async function deletePcb(uuid) {
    try {
      return await eda.dmt_Pcb.deletePcb(uuid);
    } catch (e) {
      console.warn("deletePcb failed:", e);
      return false;
    }
  }
  async function openAndActivate(uuid) {
    try {
      const tabId = await eda.dmt_EditorControl.openDocument(uuid);
      if (!tabId) return false;
      await eda.dmt_EditorControl.activateDocument(tabId);
      return true;
    } catch (e) {
      console.warn("openAndActivate failed:", e);
      return false;
    }
  }
  async function activateAndConfirm(uuid, maxTries = 20) {
    try {
      const tabId = await eda.dmt_EditorControl.openDocument(uuid);
      if (!tabId) return false;
      for (let i = 0; i < maxTries; i++) {
        await eda.dmt_EditorControl.activateDocument(tabId);
        const info = await eda.dmt_Pcb.getCurrentPcbInfo();
        if (info && info.uuid === uuid) return true;
        await new Promise((r) => setTimeout(r, 200));
      }
      return false;
    } catch (e) {
      console.warn("activateAndConfirm failed:", e);
      return false;
    }
  }
  async function savePcb(_uuid) {
    try {
      return await eda.pcb_Document.save();
    } catch (e) {
      console.warn("save failed:", e);
      return false;
    }
  }
  async function attachTempBoard(srcUuid) {
    try {
      const schematicUuid = await eda.dmt_Schematic.createSchematic();
      if (typeof schematicUuid !== "string" || !schematicUuid) return void 0;
      const boardName = await eda.dmt_Board.createBoard(schematicUuid, srcUuid);
      if (typeof boardName !== "string" || !boardName) {
        try {
          await eda.dmt_Schematic.deleteSchematic(schematicUuid);
        } catch {
        }
        return void 0;
      }
      return { schematicUuid, boardName };
    } catch (e) {
      console.warn("attachTempBoard failed:", e);
      return void 0;
    }
  }
  async function detachTempBoard(temp) {
    try {
      await eda.dmt_Board.deleteBoard(temp.boardName);
    } catch (e) {
      console.warn("deleteBoard(temp) failed:", e);
    }
    try {
      await eda.dmt_Schematic.deleteSchematic(temp.schematicUuid);
    } catch (e) {
      console.warn("deleteSchematic(temp) failed:", e);
    }
  }

  // src/core/eda/rules.ts
  var REQUIRED_DEFAULT_RULE_TYPES = [
    ["Spacing", "Safe Spacing"],
    ["Spacing", "Other Spacing"],
    ["Physics", "Track"],
    ["Physics", "Net Length Range"],
    ["Physics", "Net Length Tolerance"],
    ["Physics", "Differential Pair"],
    ["Physics", "Via Size"],
    ["Plane", "Plane Zone"],
    ["Plane", "Copper Zone"],
    ["Expansion", "Solder Mask Expansion"],
    ["Expansion", "Paste Mask Expansion"]
  ];
  function requiresUniqueDefaultRules(version) {
    const match = /^v?(\d+)\.(\d+)\.(\d+)(?:$|[.+-])/i.exec(version.trim());
    if (!match) return true;
    const actual = match.slice(1, 4).map(Number);
    const minimum = [4, 1, 84];
    for (let i = 0; i < minimum.length; i++) {
      if (actual[i] !== minimum[i]) return actual[i] > minimum[i];
    }
    return true;
  }
  function getRuleCompatibility() {
    try {
      const version = eda.sys_Environment.getEditorCurrentVersion();
      return { version, strict: requiresUniqueDefaultRules(version) };
    } catch (e) {
      console.warn("[BoardOutlineSplitter] \u8BFB\u53D6 EDA \u7248\u672C\u5931\u8D25\uFF0C\u4F7F\u7528\u65B0\u7248\u89C4\u5219\u6821\u9A8C\uFF1A", e);
      return { version: "unknown", strict: true };
    }
  }
  function normalizeRuleConfig(current) {
    const config = current && Object.prototype.hasOwnProperty.call(current, "config") ? current.config : current;
    return config && typeof config === "object" && !Array.isArray(config) ? config : void 0;
  }
  function validateUniqueDefaultRules(config) {
    const errors = [];
    for (const [group, type] of REQUIRED_DEFAULT_RULE_TYPES) {
      const rules = config[group]?.[type];
      const count = rules && typeof rules === "object" ? Object.values(rules).filter((rule) => rule?.isSetDefault === true).length : 0;
      if (count === 0) errors.push(`${group} / ${type}\uFF1A\u7F3A\u5C11\u9ED8\u8BA4\u89C4\u5219`);
      else if (count > 1) errors.push(`${group} / ${type}\uFF1A\u6709 ${count} \u4E2A\u9ED8\u8BA4\u89C4\u5219`);
    }
    return errors;
  }
  function assertCompatibleRules(config, compatibility) {
    if (!compatibility.strict) return;
    const errors = validateUniqueDefaultRules(config);
    if (errors.length) throw new Error(`EDA ${compatibility.version} \u8BBE\u8BA1\u89C4\u5219\u4E0D\u7B26\u5408\u8981\u6C42\uFF1A${errors.join("\uFF1B")}`);
  }
  async function getCurrentRules() {
    try {
      const compatibility = getRuleCompatibility();
      const current = await eda.pcb_Drc.getCurrentRuleConfiguration();
      const config = normalizeRuleConfig(current);
      if (!config) throw new Error("\u672A\u8BFB\u53D6\u5230\u6709\u6548\u7684\u8BBE\u8BA1\u89C4\u5219\u914D\u7F6E");
      assertCompatibleRules(config, compatibility);
      console.warn(`[BoardOutlineSplitter] EDA ${compatibility.version}\uFF1A${compatibility.strict ? "4.1.84+ \u9ED8\u8BA4\u89C4\u5219\u6821\u9A8C\u5DF2\u901A\u8FC7" : "\u4F7F\u7528\u65E7\u7248\u517C\u5BB9\u89C4\u5219\u540C\u6B65"}`);
      return config;
    } catch (e) {
      console.error("[BoardOutlineSplitter] \u8BFB\u53D6\u6216\u6821\u9A8C\u6E90\u8BBE\u8BA1\u89C4\u5219\u5931\u8D25\uFF1A", e);
      throw e;
    }
  }
  async function overwriteRules(config) {
    try {
      const normalized = normalizeRuleConfig(config);
      if (!normalized) throw new Error("\u672A\u63D0\u4F9B\u6709\u6548\u7684\u8BBE\u8BA1\u89C4\u5219\u914D\u7F6E");
      assertCompatibleRules(normalized, getRuleCompatibility());
      return await eda.pcb_Drc.overwriteCurrentRuleConfiguration(normalized);
    } catch (e) {
      console.error("[BoardOutlineSplitter] \u540C\u6B65\u8BBE\u8BA1\u89C4\u5219\u5931\u8D25\uFF1A", e);
      throw e;
    }
  }

  // src/core/eda/primitives.ts
  var EMPTY_BY_TYPE = () => ({
    lines: [],
    arcs: [],
    components: [],
    pads: [],
    vias: [],
    regions: [],
    fills: [],
    pours: [],
    dimensions: [],
    images: []
  });
  var PRIM_ACCESS = {
    lines: { getAll: () => eda.pcb_PrimitiveLine.getAll(), del: (ids) => eda.pcb_PrimitiveLine.delete(ids) },
    arcs: { getAll: () => eda.pcb_PrimitiveArc.getAll(), del: (ids) => eda.pcb_PrimitiveArc.delete(ids) },
    components: { getAll: () => eda.pcb_PrimitiveComponent.getAll(), del: (ids) => eda.pcb_PrimitiveComponent.delete(ids) },
    pads: { getAll: () => eda.pcb_PrimitivePad.getAll(), del: (ids) => eda.pcb_PrimitivePad.delete(ids) },
    vias: { getAll: () => eda.pcb_PrimitiveVia.getAll(), del: (ids) => eda.pcb_PrimitiveVia.delete(ids) },
    regions: { getAll: () => eda.pcb_PrimitiveRegion.getAll(), del: (ids) => eda.pcb_PrimitiveRegion.delete(ids) },
    fills: { getAll: () => eda.pcb_PrimitiveFill.getAll(), del: (ids) => eda.pcb_PrimitiveFill.delete(ids) },
    pours: { getAll: () => eda.pcb_PrimitivePour.getAll(), del: (ids) => eda.pcb_PrimitivePour.delete(ids) },
    dimensions: { getAll: () => eda.pcb_PrimitiveDimension.getAll(), del: (ids) => eda.pcb_PrimitiveDimension.delete(ids) },
    images: { getAll: () => eda.pcb_PrimitiveImage.getAll(), del: (ids) => eda.pcb_PrimitiveImage.delete(ids) }
  };
  async function collectAllByType() {
    const out = EMPTY_BY_TYPE();
    await Promise.all(
      Object.keys(PRIM_ACCESS).map(async (k) => {
        try {
          out[k] = await PRIM_ACCESS[k].getAll() ?? [];
        } catch (e) {
          console.error(`getAll ${k} failed:`, e);
          throw new Error(`\u8BFB\u53D6 ${k} \u56FE\u5143\u5931\u8D25\uFF1A${String(e)}`);
        }
      })
    );
    return out;
  }
  async function buildRepPoints(byType) {
    const m = /* @__PURE__ */ new Map();
    const mid2 = (a, b) => (a + b) / 2;
    const put = (id, p) => m.set(id, p);
    for (const c of byType.components) {
      try {
        put(c.getState_PrimitiveId(), { x: c.getState_X(), y: c.getState_Y() });
      } catch {
      }
    }
    for (const p of byType.pads) {
      try {
        put(p.getState_PrimitiveId(), { x: p.getState_X(), y: p.getState_Y() });
      } catch {
      }
    }
    for (const v of byType.vias) {
      try {
        put(v.getState_PrimitiveId(), { x: v.getState_X(), y: v.getState_Y() });
      } catch {
      }
    }
    for (const ln of byType.lines) {
      try {
        put(ln.getState_PrimitiveId(), {
          x: mid2(ln.getState_StartX(), ln.getState_EndX()),
          y: mid2(ln.getState_StartY(), ln.getState_EndY())
        });
      } catch {
      }
    }
    for (const ar of byType.arcs) {
      try {
        put(ar.getState_PrimitiveId(), {
          x: mid2(ar.getState_StartX(), ar.getState_EndX()),
          y: mid2(ar.getState_StartY(), ar.getState_EndY())
        });
      } catch {
      }
    }
    const complex = [...byType.regions, ...byType.fills, ...byType.pours, ...byType.dimensions, ...byType.images];
    await Promise.all(
      complex.map(async (prim) => {
        try {
          const id = prim.getState_PrimitiveId();
          const bbox = await getBBox([id]);
          if (bbox) put(id, bboxCenter(bbox));
        } catch (e) {
          console.warn("buildRepPoints complex failed:", e);
        }
      })
    );
    return m;
  }
  async function deleteNonKeep(byType, keep) {
    let deleted = 0;
    for (const k of Object.keys(PRIM_ACCESS)) {
      const ids = byType[k].map((p) => p.getState_PrimitiveId?.()).filter((id) => typeof id === "string");
      const candidates = ids.filter((id) => !keep.has(id));
      if (candidates.length === 0) continue;
      try {
        const liveIds = new Set((await PRIM_ACCESS[k].getAll()).map((p) => p.getState_PrimitiveId()));
        const toDelete = candidates.filter((id) => liveIds.has(id));
        if (toDelete.length === 0) continue;
        if (!await PRIM_ACCESS[k].del(toDelete)) throw new Error("\u5220\u9664\u63A5\u53E3\u8FD4\u56DE false");
        const remainingIds = new Set((await PRIM_ACCESS[k].getAll()).map((p) => p.getState_PrimitiveId()));
        if (toDelete.some((id) => remainingIds.has(id))) throw new Error("\u5220\u9664\u540E\u4ECD\u5B58\u5728\u76EE\u6807\u56FE\u5143");
        deleted += toDelete.length;
      } catch (e) {
        console.error(`delete ${k} failed:`, e);
        throw new Error(`\u5220\u9664 ${k} \u56FE\u5143\u5931\u8D25\uFF1A${String(e)}`);
      }
    }
    return deleted;
  }
  function countKept(byType, keep) {
    let n = 0;
    for (const k of Object.keys(byType)) {
      for (const p of byType[k]) {
        const id = p.getState_PrimitiveId?.();
        if (typeof id === "string" && keep.has(id)) n++;
      }
    }
    return n;
  }

  // src/core/outline-fit.ts
  var CLOSE_TOL = 5;
  var sameSnap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < CLOSE_TOL;
  function recognizeLoops(segments) {
    const warnings = [];
    const loops = [];
    if (segments.length === 0) return { loops, warnings };
    const vPts = [];
    const getV = (p) => {
      for (let i = 0; i < vPts.length; i++) {
        if (Math.hypot(vPts[i].x - p.x, vPts[i].y - p.y) < CLOSE_TOL) return i;
      }
      vPts.push(p);
      return vPts.length - 1;
    };
    const adj = /* @__PURE__ */ new Map();
    const addAdj = (v, e) => {
      const a = adj.get(v);
      if (a) a.push(e);
      else adj.set(v, [e]);
    };
    for (const seg of segments) {
      if (seg.points.length < 2) {
        warnings.push(`\u7EBF\u6BB5 ${seg.id} \u70B9\u6570\u4E0D\u8DB3\uFF0C\u8DF3\u8FC7`);
        continue;
      }
      const from = getV(seg.points[0]);
      const to = getV(seg.points[seg.points.length - 1]);
      const e = { segId: seg.id, from, to, mid: seg.points.slice(1, -1) };
      addAdj(from, e);
      addAdj(to, e);
    }
    const visited = /* @__PURE__ */ new Set();
    for (const start of vPts.keys()) {
      if (visited.has(start)) continue;
      const comp = [];
      const queue = [start];
      visited.add(start);
      while (queue.length) {
        const v = queue.shift();
        comp.push(v);
        for (const e of adj.get(v) ?? []) {
          const nb = e.from === v ? e.to : e.from;
          if (!visited.has(nb)) {
            visited.add(nb);
            queue.push(nb);
          }
        }
      }
      const allDeg2 = comp.every((v) => (adj.get(v)?.length ?? 0) === 2);
      if (!allDeg2) continue;
      if (comp.length < 2) continue;
      const traced = traceRing(start, adj, vPts);
      if (traced.points.length >= 3) {
        loops.push({
          points: traced.points,
          bbox: bboxOf(traced.points),
          sourceIds: traced.usedEdges.map((e) => e.segId)
        });
      }
    }
    return { loops, warnings };
  }
  function traceRing(start, adj, vPts) {
    const usedEdges = [];
    const usedSet = /* @__PURE__ */ new Set();
    const pts = [vPts[start]];
    let cur = start;
    for (let guard = 0; guard < 1e5; guard++) {
      const edges = adj.get(cur) ?? [];
      const e = edges.find((x) => !usedSet.has(x));
      if (!e) break;
      usedSet.add(e);
      usedEdges.push(e);
      const forward = e.from === cur;
      const next = forward ? e.to : e.from;
      const mid = forward ? e.mid : [...e.mid].reverse();
      pts.push(...mid, vPts[next]);
      cur = next;
      if (cur === start) break;
    }
    if (pts.length > 1 && sameSnap(pts[0], pts[pts.length - 1])) pts.pop();
    return { points: pts, usedEdges };
  }

  // src/core/eda/outline-read.ts
  function rawEnds(src) {
    if (!Array.isArray(src)) return null;
    const nums = [];
    for (const t of src) if (typeof t === "number") nums.push(t);
    if (nums.length < 4) return null;
    return { first: { x: nums[0], y: nums[1] }, last: { x: nums[nums.length - 2], y: nums[nums.length - 1] } };
  }
  function classifyLineGraphic(id, src, points, loops, segs) {
    if (points.length < 2) return;
    const ends = rawEnds(src);
    const endsMeet = ends ? Math.hypot(ends.first.x - ends.last.x, ends.first.y - ends.last.y) < 15 : false;
    const isWholeShape = Array.isArray(src) && (src[0] === "CIRCLE" || src[0] === "R");
    if (endsMeet || isWholeShape) {
      if (points.length >= 3) loops.push({ points, bbox: bboxOf(points), sourceIds: [id] });
    } else {
      segs.push({ id, points });
    }
  }
  async function collectBoardOutlineRegions() {
    const warnings = [];
    const lineSegs = [];
    let ids = [];
    try {
      const list = await eda.pcb_PrimitivePolyline.getAll(void 0, BOARD_OUTLINE_LAYER) ?? [];
      ids = list.map((p) => {
        try {
          return p.getState_PrimitiveId();
        } catch {
          return null;
        }
      }).filter((x) => typeof x === "string");
    } catch (e) {
      warnings.push(`\u679A\u4E3E\u677F\u6846\u5C42\u56FE\u5143\u5931\u8D25: ${String(e)}`);
      return { regions: [], lineSegs: [], warnings };
    }
    if (ids.length === 0) return { regions: [], lineSegs: [], warnings };
    const regions = [];
    try {
      await clearSelected();
      await doSelectPrimitives(ids);
      const arr = await getAllSelectedPrimitives();
      for (const p of arr) {
        try {
          const id = p.getState_PrimitiveId();
          const ptype = p.getState_PrimitiveType();
          if (ptype !== "Region") {
            if (ptype === "Polyline" || ptype === "Arc") {
              const poly = typeof p.getState_Polygon === "function" ? p.getState_Polygon() : void 0;
              const src = poly && typeof poly.getSource === "function" ? poly.getSource() : void 0;
              if (Array.isArray(src) && src.length > 0) {
                const pts = parsePolygonSource(src);
                if (pts.length >= 2) lineSegs.push({ id, src, points: pts });
              } else if (typeof p.getState_StartX === "function") {
                const start = { x: p.getState_StartX(), y: p.getState_StartY() };
                const end = { x: p.getState_EndX(), y: p.getState_EndY() };
                const pts = discretizeArc(start, end, p.getState_ArcAngle());
                if (pts.length >= 2) lineSegs.push({ id, points: pts });
              }
            }
            continue;
          }
          const name = typeof p.getState_RegionName === "function" ? p.getState_RegionName() : void 0;
          const kind = name === "Board Outline" ? "outline" : name === "Board Cutout" ? "cutout" : null;
          if (!kind) {
            warnings.push(`\u8DF3\u8FC7\u672A\u8BC6\u522B\u7684\u677F\u6846\u5C42 Region\uFF08regionName=${String(name)}\uFF09`);
            continue;
          }
          const cp = typeof p.getState_ComplexPolygon === "function" ? p.getState_ComplexPolygon() : void 0;
          const source = cp && typeof cp.getSource === "function" ? cp.getSource() : [];
          const bbox = await getBBox([id]);
          if (!bbox) {
            warnings.push(`\u8BFB\u53D6\u677F\u6846\u5305\u56F4\u76D2\u5931\u8D25: ${id}`);
            continue;
          }
          regions.push({ id, kind, source, bbox });
        } catch (e) {
          warnings.push(`\u8BFB\u53D6\u677F\u6846\u56FE\u5143\u5931\u8D25: ${String(e)}`);
        }
      }
    } catch (e) {
      warnings.push(`\u9009\u4E2D\u5E76\u8BFB\u53D6\u677F\u6846\u5931\u8D25: ${String(e)}`);
    } finally {
      try {
        await clearSelected();
      } catch {
      }
    }
    return { regions, lineSegs, warnings };
  }
  async function collectLineBoards(extraSegs = []) {
    const warnings = [];
    const loops = [];
    const segs = [];
    let polys = [];
    try {
      polys = await eda.pcb_PrimitivePolyline.getAll() ?? [];
    } catch (e) {
      warnings.push(`\u679A\u4E3E\u9876\u5C42 Polyline \u5931\u8D25: ${String(e)}`);
    }
    for (const p of polys) {
      try {
        if (p.getState_Layer() !== 1) continue;
        const net = typeof p.getState_Net === "function" ? p.getState_Net() : void 0;
        if (net) continue;
        const id = p.getState_PrimitiveId();
        const poly = p.getState_Polygon();
        const src = poly && typeof poly.getSource === "function" ? poly.getSource() : poly?.polygon;
        const pts = parsePolygonSource(src);
        classifyLineGraphic(id, src, pts, loops, segs);
      } catch (e) {
        warnings.push(`\u8BFB\u53D6\u9876\u5C42 Polyline \u5931\u8D25: ${String(e)}`);
      }
    }
    let arcs = [];
    try {
      arcs = await eda.pcb_PrimitiveArc.getAll() ?? [];
    } catch (e) {
      warnings.push(`\u679A\u4E3E\u9876\u5C42 Arc \u5931\u8D25: ${String(e)}`);
    }
    for (const a of arcs) {
      try {
        if (a.getState_Layer() !== 1) continue;
        const net = typeof a.getState_Net === "function" ? a.getState_Net() : void 0;
        if (net) continue;
        const id = a.getState_PrimitiveId();
        const start = { x: a.getState_StartX(), y: a.getState_StartY() };
        const end = { x: a.getState_EndX(), y: a.getState_EndY() };
        const ang = a.getState_ArcAngle();
        const pts = discretizeArc(start, end, ang);
        if (pts.length >= 2) segs.push({ id, points: pts });
      } catch (e) {
        warnings.push(`\u8BFB\u53D6\u9876\u5C42 Arc \u5931\u8D25: ${String(e)}`);
      }
    }
    for (const seg of extraSegs) {
      if (seg.src) classifyLineGraphic(seg.id, seg.src, seg.points, loops, segs);
      else if (seg.points.length >= 2) segs.push({ id: seg.id, points: seg.points });
    }
    const { loops: fitLoops, warnings: fitWarns } = recognizeLoops(segs);
    warnings.push(...fitWarns);
    loops.push(...fitLoops);
    return { loops, warnings };
  }

  // src/core/eda/outline-write.ts
  async function deleteOtherBoardOutlines(keepIds) {
    let deleted = 0;
    try {
      const list = await eda.pcb_PrimitivePolyline.getAll(void 0, BOARD_OUTLINE_LAYER) ?? [];
      const ids = list.map((p) => {
        try {
          return p.getState_PrimitiveId();
        } catch {
          return null;
        }
      }).filter((x) => typeof x === "string");
      if (ids.length === 0) return 0;
      await clearSelected();
      await doSelectPrimitives(ids);
      const arr = await getAllSelectedPrimitives();
      const regionDel = [];
      const polyDel = [];
      const arcDel = [];
      for (const p of arr) {
        try {
          const id = p.getState_PrimitiveId();
          if (keepIds.has(id)) continue;
          const ptype = p.getState_PrimitiveType();
          if (ptype === "Region") {
            const name = typeof p.getState_RegionName === "function" ? p.getState_RegionName() : void 0;
            if (name === "Board Outline" || name === "Board Cutout") regionDel.push(id);
          } else if (ptype === "Polyline" || ptype === "Arc") {
            (ptype === "Arc" ? arcDel : polyDel).push(id);
          }
        } catch {
        }
      }
      await clearSelected();
      if (regionDel.length > 0) {
        if (!await eda.pcb_PrimitiveRegion.delete(regionDel)) throw new Error("\u5220\u9664\u5176\u4ED6\u677F\u6846\u533A\u57DF\u5931\u8D25");
        deleted += regionDel.length;
      }
      if (polyDel.length > 0) {
        if (!await eda.pcb_PrimitivePolyline.delete(polyDel)) throw new Error("\u5220\u9664\u5176\u4ED6\u677F\u6846\u6298\u7EBF\u5931\u8D25");
        deleted += polyDel.length;
      }
      if (arcDel.length > 0) {
        if (!await eda.pcb_PrimitiveArc.delete(arcDel)) throw new Error("\u5220\u9664\u5176\u4ED6\u677F\u6846\u5706\u5F27\u5931\u8D25");
        deleted += arcDel.length;
      }
    } catch (e) {
      console.error("deleteOtherBoardOutlines failed:", e);
      throw e;
    }
    return deleted;
  }
  async function deleteOtherLineOutlines(keepIds) {
    let deleted = 0;
    try {
      const polys = await eda.pcb_PrimitivePolyline.getAll(void 0, 1) ?? [];
      const toDelete = [];
      for (const p of polys) {
        try {
          const net = typeof p.getState_Net === "function" ? p.getState_Net() : void 0;
          if (net) continue;
          const id = p.getState_PrimitiveId();
          if (!keepIds.has(id)) toDelete.push(id);
        } catch {
        }
      }
      if (toDelete.length > 0) {
        if (!await eda.pcb_PrimitivePolyline.delete(toDelete)) throw new Error("\u5220\u9664\u5176\u4ED6\u9876\u5C42\u7EBF\u6761\u677F\u6846\u5931\u8D25");
        deleted = toDelete.length;
      }
    } catch (e) {
      console.error("deleteOtherLineOutlines failed:", e);
      throw e;
    }
    return deleted;
  }

  // src/core/splitter.ts
  function toLoop(r) {
    return { points: parsePolygonSource(r.source), bbox: r.bbox, sourceIds: [r.id] };
  }
  async function detectBoards() {
    const { regions, lineSegs, warnings } = await collectBoardOutlineRegions();
    const outlines = [];
    const cutouts = [];
    for (const r of regions) {
      const loop = toLoop(r);
      if (loop.points.length < 3) {
        warnings.push(`\u677F\u6846/\u6316\u5B54 ${r.id} \u89E3\u6790\u540E\u9876\u70B9\u4E0D\u8DB3\uFF08${loop.points.length}\uFF09\uFF0C\u5DF2\u8DF3\u8FC7`);
        continue;
      }
      (r.kind === "outline" ? outlines : cutouts).push(loop);
    }
    const { loops: lineLoops, warnings: lineWarns } = await collectLineBoards(lineSegs);
    warnings.push(...lineWarns);
    outlines.push(...lineLoops);
    const { boards: boards2, warning } = classifyBoards(outlines, cutouts);
    return { boards: boards2, warning, warnings };
  }
  async function splitAll(boards2, srcInfo2, options, progress) {
    const results = [];
    if (boards2.length === 0) {
      progress({ phase: "done", message: "\u672A\u8BC6\u522B\u5230\u4EFB\u4F55\u677F\u6846", results: [] });
      return results;
    }
    if (!options.overwriteExisting) {
      const conflicts = [];
      for (const b of boards2) {
        const name = `${srcInfo2.name}_${b.index}`;
        if (await findFreePcbByName(name)) conflicts.push(name);
      }
      if (conflicts.length > 0) {
        throw new Error(`\u5DF2\u5B58\u5728\u540C\u540D PCB\uFF1A${conflicts.join("\u3001")}\u3002\u8BF7\u52FE\u9009\u300C\u81EA\u52A8\u8986\u76D6\u540C\u540D PCB\u300D\u540E\u91CD\u8BD5\uFF0C\u6216\u5148\u624B\u52A8\u5220\u9664\u8FD9\u4E9B PCB\u3002`);
      }
    }
    if (!await activateAndConfirm(srcInfo2.uuid)) throw new Error("\u6E90 PCB \u672A\u5C31\u7EEA\uFF0C\u5DF2\u4E2D\u6B62\u62C6\u5206");
    const srcRules = await getCurrentRules();
    if (!srcRules) throw new Error("\u8BFB\u53D6\u6E90 PCB \u8BBE\u8BA1\u89C4\u5219\u5931\u8D25\uFF0C\u5DF2\u4E2D\u6B62\u62C6\u5206");
    await activateAndConfirm(srcInfo2.uuid);
    const probeClone = await copyPcbFree(srcInfo2.uuid);
    let tempBoard;
    if (probeClone) {
      await deletePcb(probeClone);
    } else {
      tempBoard = await attachTempBoard(srcInfo2.uuid);
      if (!tempBoard) {
        throw new Error("copyPcb failed on source and temp-board fallback also failed. Try saving the source PCB, or create a board for it in EDA.");
      }
    }
    try {
      await splitEachBoard(boards2, srcInfo2, srcRules, progress, results);
    } finally {
      if (tempBoard) await detachTempBoard(tempBoard);
    }
    await openAndActivate(srcInfo2.uuid);
    progress({ phase: "done", message: "\u62C6\u5206\u5B8C\u6210", results });
    return results;
  }
  async function splitEachBoard(boards2, srcInfo2, srcRules, progress, results) {
    for (let i = 0; i < boards2.length; i++) {
      const board = boards2[i];
      const targetName = `${srcInfo2.name}_${board.index}`;
      progress({
        phase: "split",
        boardIndex: board.index,
        message: `\u6B63\u5728\u5904\u7406 ${targetName}\u2026`,
        pct: Math.round(i / boards2.length * 100)
      });
      try {
        const existing = await findFreePcbByName(targetName);
        const status = existing ? "updated" : "created";
        if (existing) {
          await deletePcb(existing.uuid);
          await waitForFreePcbGone(targetName);
        }
        await activateAndConfirm(srcInfo2.uuid);
        let cloneUuid = await copyPcbFree(srcInfo2.uuid);
        if (!cloneUuid) {
          await activateAndConfirm(srcInfo2.uuid);
          await new Promise((r) => setTimeout(r, 300));
          cloneUuid = await copyPcbFree(srcInfo2.uuid);
        }
        if (!cloneUuid) {
          results.push({ index: board.index, name: targetName, status: "failed", error: "\u514B\u9686 PCB \u5931\u8D25\uFF08\u6E90\u672A\u5C31\u7EEA\uFF0C\u5DF2\u91CD\u8BD5\uFF09" });
          continue;
        }
        const focused = await activateAndConfirm(cloneUuid);
        if (!focused) {
          results.push({ index: board.index, name: targetName, status: "failed", error: "\u514B\u9686\u7126\u70B9\u672A\u5207\u6362\uFF0C\u5DF2\u8DF3\u8FC7\u4EE5\u4FDD\u62A4\u6E90 PCB" });
          continue;
        }
        const cloneName = (await getAllPcbsInfo()).find((p) => p.uuid === cloneUuid)?.name;
        if (!cloneName || cloneName !== targetName) {
          await modifyPcbName(cloneUuid, targetName);
        }
        const focusInfo = await getCurrentPcbInfo();
        if (focusInfo && focusInfo.name !== targetName) {
          results.push({ index: board.index, name: targetName, status: "failed", error: `\u6539\u540D\u672A\u751F\u6548\uFF08\u5B9E\u9645=${focusInfo.name}\uFF09\uFF0C\u5B58\u5728\u540C\u540D\u6B8B\u7559` });
          continue;
        }
        const forceKeepIds = await matchCloneOutlineIds(board);
        const byType = await collectAllByType();
        const repPoints = await buildRepPoints(byType);
        const allIds = allIdsOf(byType);
        const { keep } = decideKeep({
          outer: board.outer.points,
          holes: board.holes.map((h) => h.points),
          allIds,
          repPoints,
          forceKeepIds
        });
        await deleteNonKeep(byType, keep);
        await deleteOtherBoardOutlines(forceKeepIds);
        await deleteOtherLineOutlines(forceKeepIds);
        if (!await overwriteRules(srcRules)) throw new Error("\u540C\u6B65\u8BBE\u8BA1\u89C4\u5219\u5931\u8D25");
        if (!await savePcb(cloneUuid)) throw new Error("\u4FDD\u5B58\u62C6\u5206 PCB \u5931\u8D25");
        const kept = countKept(await collectAllByType(), keep);
        results.push({ index: board.index, name: targetName, status, primitiveCount: kept });
        progress({
          phase: "split",
          boardIndex: board.index,
          message: `${targetName} \u5B8C\u6210\uFF1A\u4FDD\u7559 ${kept} \u4E2A\u56FE\u5143\uFF08${status === "updated" ? "\u5DF2\u66F4\u65B0" : "\u5DF2\u65B0\u5EFA"}\uFF09`,
          pct: Math.round((i + 1) / boards2.length * 100)
        });
      } catch (e) {
        console.error("split board failed:", e);
        results.push({ index: board.index, name: targetName, status: "failed", error: String(e) });
      }
    }
  }
  async function matchCloneOutlineIds(board) {
    const { regions, lineSegs } = await collectBoardOutlineRegions();
    const { loops: lineLoops } = await collectLineBoards(lineSegs);
    const loops = [...regions.map((r) => toLoop(r)), ...lineLoops];
    const ids = /* @__PURE__ */ new Set();
    const findLoopNear = (center) => {
      let best;
      let bestD = Infinity;
      for (const l of loops) {
        const c = bboxCenter(l.bbox);
        const d = Math.hypot(c.x - center.x, c.y - center.y);
        if (d < bestD) {
          bestD = d;
          best = l;
        }
      }
      return best;
    };
    const outerLoop = findLoopNear(board.center);
    if (outerLoop) for (const id of outerLoop.sourceIds) ids.add(id);
    for (const h of board.holes) {
      const hl = findLoopNear(bboxCenter(h.bbox));
      if (hl) for (const id of hl.sourceIds) ids.add(id);
    }
    return ids;
  }
  function allIdsOf(byType) {
    const ids = [];
    for (const k of Object.keys(byType)) {
      for (const p of byType[k]) {
        const id = p.getState_PrimitiveId?.();
        if (typeof id === "string") ids.push(id);
      }
    }
    return ids;
  }

  // iframe/app.ts
  var $ = (id) => document.getElementById(id);
  var boards = [];
  var srcInfo;
  var warningAbort = false;
  var busy = false;
  function setRunEnabled(on) {
    $("runBtn").disabled = !on;
  }
  function showWarn(text, kind = "warn") {
    const box = $("warnBox");
    box.className = kind === "warn" ? "warn" : kind === "err" ? "warn err" : "warn ok";
    box.textContent = text;
    box.classList.remove("hidden");
  }
  function hideWarn() {
    $("warnBox").classList.add("hidden");
  }
  var MIL2MM = 0.0254;
  var mm = (m) => Math.round(m * MIL2MM * 100) / 100;
  function boardSignature(bd) {
    const c = bd.center;
    const bb = bd.outer.bbox;
    return `${Math.round(c.x)},${Math.round(c.y)}|${Math.round(bb.maxX - bb.minX)}x${Math.round(bb.maxY - bb.minY)}|h${bd.holes.length}`;
  }
  function boardsSignature(bs) {
    return bs.map(boardSignature).sort().join(";;");
  }
  function renderBoards(resultMap) {
    const list = boards.map((bd) => {
      const pts = bd.outer.points;
      const bb = bd.outer.bbox;
      const w = Math.round(bb.maxX - bb.minX);
      const h = Math.round(bb.maxY - bb.minY);
      let size;
      if (isCircleLike(pts, bb)) size = `\u2300${w} mil \xB7 \u2300${mm(w)} mm`;
      else size = `${w} \xD7 ${h} mil \xB7 ${mm(w)} \xD7 ${mm(h)} mm`;
      const hole = bd.holes.length ? ` \xB7 ${bd.holes.length} \u6316\u5B54` : "";
      const r = resultMap?.get(bd.index);
      let right = "";
      let metaExtra = "";
      if (r) {
        const pillText = r.status === "created" ? "\u65B0\u5EFA" : r.status === "updated" ? "\u66F4\u65B0" : "\u5931\u8D25";
        const pill = `<span class="pill ${r.status}">${pillText}</span>`;
        if (r.status === "failed") {
          right = pill;
          metaExtra = r.error ? ` \xB7 ${r.error}` : "";
        } else {
          right = `${pill}<span class="cnt">${r.primitiveCount ?? 0} \u56FE\u5143</span>`;
        }
      }
      return `<div class="item"><div class="idx">${bd.index}</div><div class="info"><div class="row"><span class="name">${srcInfo?.name}_${bd.index}</span><span class="right">${right}</span></div><div class="meta">${size}${hole}${metaExtra}</div></div></div>`;
    }).join("");
    $("boardList").innerHTML = list;
    attachHoverHighlight();
    $("detectTitle").textContent = `\u68C0\u6D4B\u5230 ${boards.length} \u4E2A\u677F\u6846`;
  }
  async function detectAndRender() {
    $("detectTitle").textContent = "\u68C0\u6D4B\u677F\u6846\u4E2D\u2026";
    $("boardList").innerHTML = "";
    hideWarn();
    setRunEnabled(false);
    srcInfo = await getCurrentPcbInfo();
    if (!srcInfo) {
      $("srcName").textContent = "\u2014";
      showWarn("\u672A\u68C0\u6D4B\u5230\u5DF2\u6253\u5F00\u7684 PCB\uFF0C\u8BF7\u5148\u6253\u5F00\u4E00\u4E2A PCB \u6587\u6863\u3002", "err");
      return;
    }
    $("srcName").textContent = srcInfo.name;
    let result;
    try {
      result = await detectBoards();
    } catch (e) {
      showWarn("\u68C0\u6D4B\u677F\u6846\u5931\u8D25\uFF1A" + String(e), "err");
      $("refreshBtn").classList.remove("hidden");
      return;
    }
    boards = result.boards;
    warningAbort = result.warning.abort;
    renderBoards();
    $("refreshBtn").onclick = () => detectAndRender();
    $("refreshBtn").classList.remove("hidden");
    if (warningAbort) {
      showWarn(result.warning.reason ?? "\u68C0\u6D4B\u5230\u677F\u6846\u5D4C\u5957\uFF0C\u5DF2\u4E2D\u6B62\u3002", "err");
      return;
    }
    if (boards.length === 0) {
      showWarn("\u672A\u8BC6\u522B\u5230\u95ED\u5408\u677F\u6846\u3002\u8BF7\u786E\u8BA4\u677F\u6846\u7ED8\u5236\u5728\u677F\u6846\u5C42\uFF08Line/Arc\uFF09\uFF0C\u4E14\u4E3A\u95ED\u5408\u8F6E\u5ED3\u3002", "err");
      return;
    }
    if (result.warnings.length > 0) {
      showWarn(result.warnings.join("\uFF1B"), "warn");
    } else {
      hideWarn();
    }
    setRunEnabled(true);
  }
  async function ensureFreshOrAbort() {
    const cur = await getCurrentPcbInfo();
    if (!cur) {
      showWarn("\u672A\u68C0\u6D4B\u5230\u5DF2\u6253\u5F00\u7684 PCB\uFF0C\u8BF7\u5148\u6253\u5F00\u4E00\u4E2A PCB \u6587\u6863\u3002", "err");
      return false;
    }
    if (cur.uuid !== srcInfo?.uuid) {
      srcInfo = cur;
      await detectAndRender();
      showWarn(`\u5F53\u524D PCB \u5DF2\u5207\u6362\u4E3A\u300C${cur.name}\u300D\uFF0C\u5DF2\u91CD\u65B0\u68C0\u6D4B\uFF0C\u8BF7\u786E\u8BA4\u677F\u6846\u540E\u518D\u70B9\u51FB\u62C6\u5206\u3002`, "warn");
      return false;
    }
    const prevCount = boards.length;
    const prevSig = boardsSignature(boards);
    let fresh;
    try {
      fresh = await detectBoards();
    } catch (e) {
      showWarn("\u91CD\u65B0\u68C0\u6D4B\u677F\u6846\u5931\u8D25\uFF1A" + String(e), "err");
      return false;
    }
    if (fresh.warning.abort) {
      boards = fresh.boards;
      warningAbort = true;
      renderBoards();
      setRunEnabled(false);
      showWarn(fresh.warning.reason ?? "\u68C0\u6D4B\u5230\u677F\u6846\u5D4C\u5957\uFF0C\u5DF2\u4E2D\u6B62\u3002", "err");
      return false;
    }
    if (boardsSignature(fresh.boards) !== prevSig) {
      boards = fresh.boards;
      srcInfo = cur;
      warningAbort = false;
      renderBoards();
      setRunEnabled(boards.length > 0);
      showWarn(`\u677F\u6846\u5DF2\u53D8\u5316\uFF08\u539F ${prevCount} \u2192 \u73B0 ${boards.length}\uFF09\uFF0C\u5DF2\u5237\u65B0\u4E3A\u6700\u65B0\uFF0C\u8BF7\u786E\u8BA4\u540E\u518D\u6B21\u70B9\u51FB\u300C\u5F00\u59CB\u62C6\u5206\u300D\u3002`, "warn");
      return false;
    }
    boards = fresh.boards;
    srcInfo = cur;
    warningAbort = false;
    return true;
  }
  function highlightOutline(bd) {
    if (busy) return;
    const ids = bd.outer.sourceIds;
    if (!ids || ids.length === 0) return;
    clearSelected().then(() => doSelectPrimitives(ids)).catch(() => {
    });
  }
  function attachHoverHighlight() {
    const items = $("boardList").querySelectorAll(".item");
    items.forEach((el, i) => {
      const bd = boards[i];
      if (!bd) return;
      el.addEventListener("mouseenter", () => highlightOutline(bd));
    });
  }
  $("boardList").addEventListener("mouseleave", () => {
    if (!busy) clearSelected().catch(() => {
    });
  });
  $("runBtn").onclick = async () => {
    if (!srcInfo || warningAbort || boards.length === 0) return;
    setRunEnabled(false);
    busy = true;
    $("refreshBtn").disabled = true;
    $("runBtn").textContent = "\u6821\u9A8C\u4E2D\u2026";
    hideWarn();
    const ok = await ensureFreshOrAbort();
    if (!ok) {
      $("runBtn").textContent = "\u5F00\u59CB\u62C6\u5206";
      $("refreshBtn").disabled = false;
      setRunEnabled(boards.length > 0 && !warningAbort);
      busy = false;
      return;
    }
    $("runBtn").textContent = "\u62C6\u5206\u4E2D\u2026";
    const options = { overwriteExisting: $("overwriteExisting").checked };
    const progress = (_m) => {
    };
    try {
      const results = await splitAll(boards, srcInfo, options, progress);
      renderBoards(new Map(results.map((r) => [r.index, r])));
      const failedCount = results.filter((r) => r.status === "failed").length;
      if (failedCount > 0) {
        showWarn(`${failedCount} \u4E2A PCB \u62C6\u5206\u5931\u8D25\uFF0C\u8BF7\u67E5\u770B\u5217\u8868\u4E2D\u7684\u5931\u8D25\u539F\u56E0\u3002`, "err");
        $("runBtn").textContent = "\u62C6\u5206\u6709\u5931\u8D25\uFF0C\u53EF\u91CD\u8BD5";
      } else {
        $("runBtn").textContent = "\u5B8C\u6210\uFF0C\u53EF\u91CD\u65B0\u62C6\u5206";
      }
    } catch (e) {
      showWarn("\u62C6\u5206\u5931\u8D25\uFF1A" + String(e), "err");
      $("runBtn").textContent = "\u91CD\u8BD5";
    } finally {
      busy = false;
      setRunEnabled(true);
      $("refreshBtn").disabled = false;
    }
  };
  detectAndRender().catch((e) => {
    showWarn("\u521D\u59CB\u5316\u5931\u8D25\uFF1A" + String(e), "err");
    console.error("init failed:", e);
  });
})();
