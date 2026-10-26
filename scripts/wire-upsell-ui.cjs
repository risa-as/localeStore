const fs=require('node:fs');
const productPath='components/admin/product-form.tsx';
let product=fs.readFileSync(productPath,'utf8');
const at=product.indexOf('            <FormField\n',product.indexOf('name="offers"'));
// Insert at the form's first field, keeping the component inside its form provider.
const first=product.indexOf('<FormField');
if(first<0)throw new Error('Product form missing');
product=product.slice(0,first)+`<FormField control={form.control} name="relatedProductIds" render={({ field }) => <FormItem><FormLabel>منتجات مكملة لهذا المنتج (حتى 3)</FormLabel><p className="text-xs text-muted-foreground">اختر المنتجات التي تصلح فعلاً معه؛ ستظهر للزبون لإضافتها إلى طلبه نفسه.</p><div className="max-h-40 overflow-auto border rounded p-3 space-y-2">{relatedOptions.filter(option => option.id !== productId).map(option => <label className="flex gap-2 text-sm" key={option.id}><input type="checkbox" checked={(field.value ?? []).includes(option.id)} disabled={!(field.value ?? []).includes(option.id) && (field.value ?? []).length >= 3} onChange={event => field.onChange(event.target.checked ? [...(field.value ?? []), option.id] : (field.value ?? []).filter(id => id !== option.id))}/>{option.name}</label>)}</div><FormMessage/></FormItem>} />\n`+product.slice(first);
fs.writeFileSync(productPath,product);
const path='app/[locale]/thank-you/page.tsx';
let source=fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
source=source.replace('import Link from "next/link";', 'import Link from "next/link";\nimport OrderSuggestions from "@/components/shared/order-suggestions";');
source=source.replace('  const [timeLeft, setTimeLeft] = useState(isDuplicate ? 0 : 12);','');
const start=source.indexOf('  // 3. العداد');
const end=source.indexOf('  return (',start);
if(start<0||end<0)throw new Error('Missing redirect effects');
// Find the component return after the final redirect effect, not the cleanup return.
const componentReturn=source.indexOf('\n  return (\n    <div',start);
source=source.slice(0,start)+source.slice(componentReturn);
source=source.replace('className="w-full max-w-md relative"','className="w-full max-w-3xl relative"');
const countdownStart=source.indexOf('            {!isDuplicate && (');
const countdownEnd=source.indexOf('            )}',countdownStart)+'            )}'.length;
if(countdownStart>=0)source=source.slice(0,countdownStart)+source.slice(countdownEnd);
source=source.replace('          <CardFooter className=', '          {orderId && purchase && <div className="px-6 pb-6"><OrderSuggestions orderId={orderId} onAdded={() => { import("@/lib/actions/upsell.actions").then(({ getOrderReceipt }) => getOrderReceipt(orderId)).then(summary => setPurchase(previous => previous ? { ...previous, summary } : previous)); }}/></div>}\n          <CardFooter className=');
fs.writeFileSync(path,source);
