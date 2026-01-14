import { Resend } from "resend";
import { SENDER_EMAIL, APP_NAME } from "@/lib/constants";
import { Order } from "@/types";
// بداية كود التعديل
import { render } from "@react-email/render";
// نهاية كود التعديل
import dotenv from "dotenv";
dotenv.config();

import PurchaseReceiptEmail from "./purchase-receipt";

const resend = new Resend(process.env.RESEND_API_KEY as string);

export const sendPurchaseReceipt = async ({ order }: { order: Order }) => {
  // بداية كود التعديل
  const html = await render(<PurchaseReceiptEmail order={order} />);
  // نهاية كود التعديل

  try {
    const response = await resend.emails.send({
      from: `${APP_NAME} <${SENDER_EMAIL}>`,
      to: order.user.email,
      subject: `Order Confirmation ${order.id}`,
      html,
    });
    // console.log("Email sent successfully:", response);
  } catch (err) {
    console.error("Failed to send email:", err);
  }
};
