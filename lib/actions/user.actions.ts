"use server";
import {
  paymentMethodSchema,
  shippingAddressSchema,
  signInFormSchema,
  signUpFormSchema,
  updateUserSchema,
} from "../validators";
import { auth, signIn, signOut } from "@/auth";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { prisma } from "@/db/prisma";
import { hashSync } from "bcrypt-ts-edge";
import { formatError } from "../utils";
import { ShippingAddress } from "@/types";
import z from "zod";
import { getMyCart } from "./cart.actions";
import { PAGE_SIZE } from "../constants";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
// Sign In The User with credentials
export async function signInWithCredentials(
  prevState: unknown,
  formData: FormData
) {
  try {
    const user = signInFormSchema.parse({
      email: formData.get("email"),
      password: formData.get("password"),
    });
    // // طريقة الاولى
    await signIn("credentials", {
      email: user.email,
      password: user.password,
      redirect: true,
      callbackUrl: "/",
      redirectTo: "/",
    });
    return { success: true, message: "Signed in successfully" };
    // // طريقة ثانية
    // const callbackUrl = formData.get("callbackUrl") as string | undefined;
    // // console.log("Callback URL:", callbackUrl);
    // await signIn("credentials", {
    //   email: user.email,
    //   password: user.password,
    //   redirect: false,
    // });
    // redirect(callbackUrl || "/");
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { success: false, message: "Invalid email or password" };
  }
}

// Sign User Out
export async function signOutUser() {
  // get current users cart and delete it so it does not persist to next user
  const currentCart = await getMyCart();

  if (currentCart?.id) {
    await prisma.cart.delete({ where: { id: currentCart.id } });
  } else {
    console.warn("No cart found for deletion.");
  }
  await signOut({});
}

// Sign Up User
export async function signUpUser(prevState: unknown, formData: FormData) {
  try {
    const user = signUpFormSchema.parse({
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password"),
      confirmPassword: formData.get("confirmPassword"),
    });

    const hashPassword = hashSync(user.password);

    await prisma.user.create({
      data: {
        name: user.name,
        email: user.email,
        password: hashPassword,
      },
    });

    await signIn("credentials", {
      email: user.email,
      password: user.password,
    });
    return { success: true, fieldErrors: {}, formError: "" };
    // ... داخل الدالة
  } catch (error) {
    if (isRedirectError(error)) throw error;
    // Use Function From Utils To Handle Error
    const errorMessage = formatError(error);
    return errorMessage;
  }
}

// Get User By the Id
export async function getUserById(userId: string) {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
    },
  });
  if (!user) throw new Error("User Not Found");
  return user;
}

// Update the user address
export async function updateUserAddress(data: ShippingAddress) {
  try {
    const session = await auth();
    const currentUser = await prisma.user.findFirst({
      where: {
        id: session?.user?.id,
      },
    });
    if (!currentUser) throw new Error("User Not Found");
    const address = shippingAddressSchema.parse(data);
    await prisma.user.update({
      where: { id: currentUser.id },
      data: { address },
    });
    return {
      success: true,
      message: "User Updated Successflly",
    };
  } catch (error) {
    const { success, formError } = formatError(error);
    return {
      success,
      message: formError,
    };
  }
}

// Update user's payment method

export async function updateUserPaymentMethod(
  data: z.infer<typeof paymentMethodSchema>
) {
  try {
    const session = await auth();
    const currentUser = await prisma.user.findFirst({
      where: { id: session?.user?.id },
    });
    if (!currentUser) throw new Error("User Not Found");
    const paymentMethod = paymentMethodSchema.parse(data);
    await prisma.user.update({
      where: { id: currentUser.id },
      data: { paymentMethod: paymentMethod.type },
    });
    return {
      success: true,
      message: "User Updated Successflly",
    };
  } catch (error) {
    const { success, formError } = formatError(error);
    return {
      success,
      message: formError,
    };
  }
}

// Update the user profile
export async function updateProfile(user: { name: string; email: string }) {
  try {
    const session = await auth();

    const currentUser = await prisma.user.findFirst({
      where: {
        id: session?.user?.id,
      },
    });

    if (!currentUser) throw new Error("User not found");

    await prisma.user.update({
      where: {
        id: currentUser.id,
      },
      data: {
        name: user.name,
      },
    });

    return {
      success: true,
      message: "User updated successfully",
    };
  } catch (error) {
    const { success, formError } = formatError(error);
    return {
      success,
      message: formError,
    };
  }
}

// get all users
export async function getAllUsers({
  limit = PAGE_SIZE,
  page,
  query,
}: {
  limit?: number;
  page: number;
  query: string;
}) {
  const queryFilter: Prisma.UserWhereInput =
    query && query !== "all"
      ? {
          email: {
            contains: query,
            mode: "insensitive",
          } as Prisma.StringFilter,
        }
      : {};
  const data = await prisma.user.findMany({
    where: {
      ...queryFilter,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: (page - 1) * limit,
  });

  const dataCount = await prisma.user.count();

  return {
    data,
    totalPages: Math.ceil(dataCount / limit),
  };
}

// Delete User
export async function deleteUser(id: string) {
  try {
    await prisma.user.delete({
      where: {
        id,
      },
    });
    revalidatePath("/admin/users");

    return { success: true, message: "User Deleted Successfully" };
  } catch (error) {
    const { formError } = formatError(error);
    return { success: false, message: formError };
  }
}

// Update user
export async function updateUser(user: z.infer<typeof updateUserSchema>) {
  try {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        name: user.name,
        role: user.role,
      },
    });
    revalidatePath("/admin/users");
    return {
      success: true,
      message: "User Updated Successfully",
    };
  } catch (error) {
    const { formError } = formatError(error);
    return { success: false, message: formError };
  }
}
