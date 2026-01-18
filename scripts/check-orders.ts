
import 'dotenv/config';
import { getAllOrders } from "@/lib/actions/order.actions";
import { prisma } from "@/db/prisma";

async function main() {
    console.log("Checking orders...");
    try {
        const orders = await getAllOrders({ page: 1, limit: 10, query: "" });
        console.log(`Found ${orders.data.length} orders.`);

        if (orders.data.length > 0) {
            console.log("First order sample:");
            const order = orders.data[0];
            console.log(JSON.stringify(order, null, 2));

            // Check orderitems specifically
            // @ts-ignore
            if (order.orderitems) {
                // @ts-ignore
                console.log(`Order has ${order.orderitems.length} items.`);
            } else {
                console.log("Order has NO orderitems property.");
                // Check for other casings
                // @ts-ignore
                if (order.orderItems) console.log("Found orderItems (camelCase)!");
                // @ts-ignore
                if (order.OrderItems) console.log("Found OrderItems (PascalCase)!");
            }
        } else {
            console.log("No orders found in DB.");
        }

    } catch (error) {
        console.error("Error fetching orders:", error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
