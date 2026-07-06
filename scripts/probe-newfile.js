const out = {};
const safe = async (label, fn) => {
  try { out[label] = await fn(); }
  catch (e) { out[label] = 'THREW: ' + (e && e.message ? e.message : String(e)); }
};

await safe('cur_full', async () => eda.dmt_Pcb.getCurrentPcbInfo());
await safe('all_full', async () => eda.dmt_Pcb.getAllPcbsInfo());

const cur = (out.cur_full && typeof out.cur_full === 'object' && !String(out.cur_full).startsWith('THREW')) ? out.cur_full : null;
out.cur_uuid = cur ? cur.uuid : null;
out.cur_name = cur ? cur.name : null;
out.cur_parentBoardName = cur ? cur.parentBoardName : undefined;
out.cur_keys = cur ? Object.keys(cur) : null;

out.eda_keys_sch = Object.keys(eda).filter(k => /sch|board|project|doc|dmt/i.test(k));

if (cur && cur.uuid) {
  let r;
  try {
    r = await eda.dmt_Pcb.copyPcb(cur.uuid);
    out.copyPcb_returned = r;
    out.copyPcb_type = typeof r;
  } catch (e) {
    out.copyPcb_threw = (e && e.message) ? e.message : String(e);
    if (e && e.stack) out.copyPcb_stack = String(e.stack).split('\n').slice(0, 6).join(' || ');
  }
  if (typeof r === 'string' && r) {
    await safe('clone_info', async () => {
      const all = await eda.dmt_Pcb.getAllPcbsInfo();
      return (all || []).find(p => p.uuid === r);
    });
    await safe('clone_deleted', async () => eda.dmt_Pcb.deletePcb(r));
  }
}

return out;
