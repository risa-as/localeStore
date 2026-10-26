"use server";
import { CartItem } from "@/types";
import { convertToPlainObject, formatError, round2 } from "../utils";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/db/prisma";
import { cartItemSchema, insertCartSchema } from "../validators";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { getTranslations } from "next-intl/server";
import { computeOrderPricing } from "../pricing";
import { getAvailableStock } from "../inventory";
// Calculate cart prices
const calcPrice = (items: CartItem[]) => {
  const itemsPrice = round2(
    items.reduce((acc, item) => acc + computeOrderPricing({ quantity: item.qty, unitPrice: Number(item.price), shippingPrice: 0, offers: item.offers }).itemsPrice, 0)
  ),
    shippingPrice = items.length > 0
      ? Math.max(...items.map((item) => Number(item.shippingPrice)))
      : 0,
    totalPrice = round2(itemsPrice + shippingPrice);
  return {
    itemsPrice: itemsPrice.toFixed(2),
    shippingPrice: shippingPrice.toFixed(2),
    totalPrice: totalPrice.toFixed(2),
  };
};
export async function addItemToCart(data: CartItem) {
  try {
    const t = await getTranslations("Toast");
    // Check for cart cookie
    const sessionCartId = (await cookies()).get("sessionCartId")?.value;
    if (!sessionCartId) throw new Error(t("cartSessionNotFound"));
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
        isArchived: false,
      },
    });
    if (!product) throw new Error(t("productNotFound"));

    // Ensure price, shippingPrice, and costPrice match product
    item.price = product.price.toString();
    item.shippingPrice = product.shippingPrice.toString();
    item.costPrice = product.costPrice.toString();
    item.offers = product.offers;
    item.name = product.name;
    item.slug = product.slug;
    item.image = product.images[0] || item.image;
    const existingQty = cart?.items.find((x: CartItem) => x.productId === item.productId)?.qty ?? 0;
    const available = await getAvailableStock(product.id, product.stock);
    if (existingQty + (existingQty ? 1 : item.qty) > available) throw new Error(t("notEnoughStock"));

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
      revalidatePath('/[locale]', 'layout');
      return {
        success: true,
        message: `${product.name} ${t("addedToCart")}`,
      };
    } else {
      // Check If item is already in cart
      const existItem = (cart.items as CartItem[]).find(
        (x) => x.productId === item.productId
      );
      if (existItem) {
        // Check stock
        if (product.stock < existItem.qty + 1) {
          throw new Error(t("notEnoughStock"));
        }
        // Increase the quantity
        (cart.items as CartItem[]).find(
          (x) => x.productId === item.productId
        )!.qty = existItem.qty + 1;
      } else {
        // If Item does not exist in cart
        // Check stock
        if (product.stock < 1) {
          throw new Error(t("notEnoughStock"));
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
      revalidatePath('/[locale]', 'layout');

      return {
        success: true,
        message: `${product.name} ${existItem ? t("updatedInCart") : t("addedToCart")
          }`,
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
  //   if (!sessionCartId) throw new Error("Cart Session Not Found");
  // Get session and user id
  const session = await auth();
  const userId = session?.user?.id ? (session?.user.id as string) : undefined;
  // Get User cart from db
  if (!userId && !sessionCartId) return undefined;
  const cart = await prisma.cart.findFirst({
    where: userId ? { userId: userId } : { sessionCartId: sessionCartId },
  });
  if (!cart) return undefined;
  const products = await prisma.product.findMany({ where: { id: { in: (cart.items as CartItem[]).map(item => item.productId) } } });
  const items = (cart.items as CartItem[]).map(item => {
    const product = products.find(product => product.id === item.productId);
    if (!product) return item;
    return { ...item, price: product.price.toString(), costPrice: product.costPrice.toString(), shippingPrice: product.shippingPrice.toString(), offers: product.offers };
  });
  // convert decimals and return
  return convertToPlainObject({
    ...cart,
    items,
    ...calcPrice(items),
  });
}

export async function removeItemFromCart(productId: string) {
  try {
    const t = await getTranslations("Toast");
    // check for cart cookie
    const sessionCartId = (await cookies()).get("sessionCartId")?.value;
    if (!sessionCartId) throw new Error(t("cartSessionNotFound"));
    // Get Product
    const product = await prisma.product.findFirst({
      where: { id: productId },
    });
    if (!product) throw new Error(t("productNotFound"));
    //Get User Cart
    const cart = await getMyCart();
    if (!cart) throw new Error(t("cartNotFound"));
    // Check for item
    const exist = (cart.items as CartItem[]).find(
      (x) => x.productId === productId
    );
    if (!exist) throw new Error(t("itemNotFound"));
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
    revalidatePath('/[locale]', 'layout');
    return {
      success: true,
      message: `${product.name} ${exist.qty > 1 ? t("updatedInCart") : t("removedFromCart")
        }`,
    };
  } catch (error) {
    // Use Function From Utils To Handle Error
    const { formError, success } = formatError(error);
    return { success, message: formError };
  }
}
