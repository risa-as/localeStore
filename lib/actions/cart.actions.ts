"use server";
import { CartItem } from "@/types";
import { convertToPlainObject, formatError, round2 } from "../utils";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/db/prisma";
import { cartItemSchema, insertCartSchema } from "../validators";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
// Calculate cart prices
const calcPrice = (items: CartItem[]) => {
  const itemsPrice = round2(
      items.reduce((acc, item) => acc + Number(item.price) * item.qty, 0)
    ),
    shippingPrice = round2(itemsPrice > 100 ? 0 : 5),
    taxPrice = round2(0.15 * itemsPrice),
    totalPrice = round2(itemsPrice + taxPrice + shippingPrice);
  return {
    itemsPrice: itemsPrice.toFixed(2),
    shippingPrice: shippingPrice.toFixed(2),
    taxPrice: taxPrice.toFixed(2),
    totalPrice: totalPrice.toFixed(2),
  };
};
export async function addItemToCart(data: CartItem) {
  try {
    // Check for cart cookie
    const sessionCartId = (await cookies()).get("sessionCartId")?.value;
    if (!sessionCartId) throw new Error("Cart Session Not Found");
    // Get session and user id
    const session = await auth();
    const userId = session?.user?.id ? (session?.user.id as string) : undefined;
    // Get Cart
    const cart = await getMyCart();
    // Parse and validate item
    const item = cartItemSchema.parse(data);
    // Get Product
    const product = await prisma.product.findFirst({
      where: {
        id: item.productId,
      },
    });
    if (!product) throw new Error("Product Not Found");

    // Create New Cart Object
    if (!cart) {
      const newCart = insertCartSchema.parse({
        userId: userId,
        items: [item],
        sessionCartId: sessionCartId,
        ...calcPrice([item]),
      });
      await prisma.cart.create({
        data: newCart,
      });

      // Revalidate product page
      revalidatePath(`/product/${product.slug}`);
      return {
        success: true,
        message: `${product.name} Added To Cart`,
      };
    } else {
      // Check If item is already in cart
      const existItem = (cart.items as CartItem[]).find(
        (x) => x.productId === item.productId
      );
      if (existItem) {
        // Check stock
        if (product.stock < existItem.qty + 1) {
          throw new Error("Not Enough Stock");
        }
        // Increase the quantity
        (cart.items as CartItem[]).find(
          (x) => x.productId === item.productId
        )!.qty = existItem.qty + 1;
      } else {
        // If Item does not exist in cart
        // Check stock
        if (product.stock < 1) {
          throw new Error("Not Enough Stock");
        }
        cart.items.push(item);
      }
      // Save to dattabase
      await prisma.cart.update({
        where: { id: cart.id },
        data: {
          items: cart.items as Prisma.CartUpdateitemsInput[],
          ...calcPrice(cart.items as CartItem[]),
        },
      });
      // Revalidate product page
      revalidatePath(`/product/${product.slug}`);

      return {
        success: true,
        message: `${product.name} ${
          existItem ? "Updated In" : "Added To"
        } Cart`,
      };
    }
  } catch (error) {
    // Use Function From Utils To Handle Error
    const { formError, success } = formatError(error);
    return { success, message: formError };
  }
}

export async function getMyCart() {
  // Check for cart cookie
  const sessionCartId = (await cookies()).get("sessionCartId")?.value;
  if (!sessionCartId) throw new Error("Cart Session Not Found");
  // Get session and user id
  const session = await auth();
  const userId = session?.user?.id ? (session?.user.id as string) : undefined;
  // Get User cart from db
  const cart = await prisma.cart.findFirst({
    where: userId ? { userId: userId } : { sessionCartId: sessionCartId },
  });
  if (!cart) return undefined;
  // convert decimals and return
  return convertToPlainObject({
    ...cart,
    items: cart.items as CartItem[],
    itemsPrice: cart.itemsPrice.toString(),
    totalPrice: cart.totalPrice.toString(),
    shippingPrice: cart.shippingPrice.toString(),
    taxPrice: cart.taxPrice.toString(),
  });
}

export async function removeItemFromCart(productId: string) {
  try {
    // check for cart cookie
    const sessionCartId = (await cookies()).get("sessionCartId")?.value;
    if (!sessionCartId) throw new Error("Cart Session Not Found");
    // Get Product
    const product = await prisma.product.findFirst({
      where: { id: productId },
    });
    if (!product) throw new Error("Product Not Found");
    //Get User Cart
    const cart = await getMyCart();
    if (!cart) throw new Error("Cart Not Found");
    // Check for item
    const exist = (cart.items as CartItem[]).find(
      (x) => x.productId === productId
    );
    if (!exist) throw new Error("Item Not found");
    // check if only one in qty
    if (exist.qty === 1) {
      cart.items = (cart.items as CartItem[]).filter(
        (x) => x.productId !== productId
      );
    } else {
      (cart.items as CartItem[]).find((x) => x.productId === productId)!.qty =
        exist.qty - 1;
    }
    // Update Cart in Database
    await prisma.cart.update({
      where: { id: cart.id },
      data: {
        items: cart.items as Prisma.CartUpdateitemsInput[],
        ...calcPrice(cart.items as CartItem[]),
      },
    });
    // Revalidate product page
    revalidatePath(`/product/${product.slug}`);
    return {
      success: true,
      message: `${product.name} ${
        exist.qty > 1 ? "Updated In" : "Remove From"
      } Cart`,
    };
  } catch (error) {
    // Use Function From Utils To Handle Error
    const { formError, success } = formatError(error);
    return { success, message: formError };
  }
}
