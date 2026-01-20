export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Prostore";
export const APP_DESCRIPTION =
  process.env.NEXT_PUBLIC_APP_DESCRIPTION ||
  "An e-commerce platform built with Next.js and TypeScript.";
export const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000";
export const LATEST_PRODUCTS_LIMIT =
  Number(process.env.NEXT_PUBLIC_LATEST_PRODUCTS_LIMIT) || 6;
export const signInDefaultValues = {
  email: "",
  password: "",
};
export const signUpDefaultValues = {
  name: "",
  email: "",
  password: "",
  confirmPassword: "",
};

export const shippingAddressDefaultValues = {
  fullName: "",
  streetAddress: "",
  city: "",
  postalCode: "",
  country: "",
};

export const PAYMENT_METHODS = process.env.PAYMENT_METHODS
  ? process.env.PAYMENT_METHODS.split(", ")
  : ["PayPal", "Stripe", "CashOnDelivery"];
export const DEFAULT_PAYMENT_METHOD =
  process.env.DEFAULT_PAYMENT_METHOD || "PayPal";

export const PAGE_SIZE = Number(process.env.PAGE_SIZE) || 10;

export const productDefaultValues = {
  name: "",
  slug: "",
  category: "",
  images: [],
  colors: [],
  description: "",
  price: "0",
  shippingPrice: "0",
  costPrice: "0",
  stock: 0,
  rating: 0,
  numReviews: "0",
  isFeatured: false,
  banner: null,
  offers: "",
};

export const USER_ROLES = process.env.USER_ROLES
  ? process.env.USER_ROLES.split(", ")
  : ["admin", "user", "employee"];

export const reviewFormDefaultValues = {
  title: "",
  description: "",
  rating: 0,
};

export const SENDER_EMAIL = process.env.SENDER_EMAIL || "onboarding@resend.dev";

export const iraqGovernorates = [
  "Baghdad",
  "Basra",
  "Nineveh",
  "Erbil",
  "Kirkuk",
  "Sulaymaniyah",
  "Diyala",
  "Babylon",
  "Anbar",
  "Dhi Qar",
  "Karbala",
  "Najaf",
  "Wasit",
  "Qadisiyah",
  "Maysan",
  "Muthanna",
  "Saladin",
  "Dohuk",
];
