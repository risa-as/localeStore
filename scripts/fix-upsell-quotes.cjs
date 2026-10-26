const fs=require('node:fs');
const path='components/shared/order-suggestions.tsx';
let source=fs.readFileSync(path,'utf8');
source=source.replace('color: colors[product.id] });','color: colors[product.id], expectedIncrement: product.totalIncrement });');
source=source.replace('setMessage(result.message); if (result.success) { setProducts(current => current.filter(item => item.id !== product.id)); onAdded?.(); }','setMessage(result.message); setProducts(await getOrderSuggestions(orderId)); if (result.success) { onAdded?.(); }');
fs.writeFileSync(path,source);
