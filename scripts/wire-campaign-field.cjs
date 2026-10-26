const fs=require('node:fs');
const path='app/[locale]/admin/expenses/adspend-client.tsx';
let source=fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
for(const name of ['EditManualCampaignForm','ManualCampaignForm']) {
 const start=source.indexOf('function '+name+'(');
 const position=source.indexOf('    <div className="space-y-3">',start)+'    <div className="space-y-3">'.length;
 if(start<0||position<start)throw new Error('Missing campaign form');
 source=source.slice(0,position)+`
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">معرف حملة Meta (اختياري)</label>
        <Input value={form.campaignId} onChange={event => setForm({ ...form, campaignId: event.target.value })} />
        <p className="text-xs text-muted-foreground">اتركه فارغاً للمصروف الإضافي. عند ربطه، تُستبدل فقط الأيام المستوردة لنفس الحملة.</p>
      </div>`+source.slice(position);
}
fs.writeFileSync(path,source);
