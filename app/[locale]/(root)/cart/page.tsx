import { getMyCart } from "@/lib/actions/cart.actions";
import CartTable from "./cart-table";
import { getTranslations } from "next-intl/server";

export const metadata = {
  title: "سلة التسوق",
};
const CartPage = async () => {
  const cart = await getMyCart();
  const t = await getTranslations('Cart');
  return (
    <>
      <CartTable cart={cart} />
    </>
  );
};

export default CartPage;
