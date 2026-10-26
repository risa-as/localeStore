const fs = require('node:fs');
const path = 'lib/actions/order.actions.ts';
let source = fs.readFileSync(path, 'utf8');
const needle = '    return {\n      success: true,\n      message: "Order created",';
source = source.replace(/\r\n/g, '\n');
if (source.split(needle).length !== 3) throw new Error('Expected both creation paths');
source = source.split(needle).join('    await grantOrderAccess(insertedOrderId);\n' + needle);
fs.writeFileSync(path, source);
