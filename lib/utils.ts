import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { ZodError } from "zod";
import qs from "query-string";

// Combine class names using clsx and tailwind-merge
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Convert a value to a plain JavaScript object by serializing and deserializing it.
export function convertToPlainObject<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

// Format number with decimal places
export function formatNumberWithDecimal(num: number): string {
  const [int, decimal] = num.toString().split(".");
  return decimal ? `${int}.${decimal.padEnd(2, "0")}` : `${int}.00`;
}

// Form Errors

export function formatError(error: unknown) {
  // ZOD ERRORS
  if (error instanceof ZodError) {
    return {
      success: false,
      fieldErrors: error.flatten().fieldErrors,
      formError: "",
    };
  }

  // PRISMA UNIQUE ERROR
  if (
    error &&
    typeof error === "object" &&
    "name" in error &&
    "code" in error &&
    error.name === "PrismaClientKnownRequestError" &&
    (error.code === "23505" || error.code === "P2002")
  ) {
    const target = (error as any).meta?.target;
    if (Array.isArray(target) && target.includes("slug")) {
      return {
        success: false,
        fieldErrors: {},
        formError: "Product with this slug already exists",
      }
    }
    return {
      success: false,
      fieldErrors: {},
      formError: "This record already exists",
    };
  }

  // UNKNOWN ERROR
  return {
    success: false,
    fieldErrors: {},
    formError: "An unexpected error occurred",
  };
}

// Round number to 2 decimal places
export function round2(value: number | string) {
  if (typeof value === "number") {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  } else if (typeof value === "string") {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  } else {
    throw new Error("value is not a number or string");
  }
}

// Currency Formatter
// Format Currency using the formatter above
export function formatCurrency(amount: number | string | null) {
  const formatter = new Intl.NumberFormat("en-US", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  if (typeof amount === "number") {
    return `${formatter.format(amount * 1000)} د.ع`;
  } else if (typeof amount === "string") {
    return `${formatter.format(Number(amount) * 1000)} د.ع`;
  } else {
    return "NaN";
  }
}

// Format Number
const Number_Formatter = new Intl.NumberFormat("en-US");
export function formatNumber(number: number) {
  return Number_Formatter.format(number);
}

// Shorten UUID
export function formatId(id: string) {
  return `..${id.substring(id.length - 6)}`;
}

// Format date and times
export const formatDateTime = (dateString: Date) => {
  const dateTimeOptions: Intl.DateTimeFormatOptions = {
    year: "numeric", // abbreviated month name (e.g., 'Oct')
    month: "short", // abbreviated month name (e.g., 'Oct')
    day: "numeric", // numeric day of the month (e.g., '25')
    hour: "numeric", // numeric hour (e.g., '8')
    minute: "numeric", // numeric minute (e.g., '30')
    hour12: true, // use 12-hour clock (true) or 24-hour clock (false)
  };
  const dateOptions: Intl.DateTimeFormatOptions = {
    year: "numeric", // numeric year (e.g., '2023')
    month: "short", // abbreviated month name (e.g., 'Oct')
    weekday: "short", // abbreviated weekday name (e.g., 'Mon')
    day: "numeric", // numeric day of the month (e.g., '25')
  };
  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: "numeric", // numeric hour (e.g., '8')
    minute: "numeric", // numeric minute (e.g., '30')
    hour12: true, // use 12-hour clock (true) or 24-hour clock (false)
  };
  const formattedDateTime: string = new Date(dateString).toLocaleString(
    "en-US",
    dateTimeOptions
  );
  const formattedDate: string = new Date(dateString).toLocaleString(
    "en-US",
    dateOptions
  );
  const formattedTime: string = new Date(dateString).toLocaleString(
    "en-US",
    timeOptions
  );
  return {
    dateTime: formattedDateTime,
    dateOnly: formattedDate,
    timeOnly: formattedTime,
  };
};

// Form the pagination links
export function formUrlQuery({
  params,
  key,
  value,
}: {
  params: string;
  key: string;
  value: string | null;
}) {
  const query = qs.parse(params);
  query[key] = value;

  return qs.stringifyUrl(
    {
      url: window.location.pathname,
      query,
    },
    {
      skipNull: true,
    }
  );
}

// Convert Eastern Arabic numerals to Western Arabic numerals
export function convertArabicToEnglishNumbers(str: string) {
  return str.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, function (c) {
    return String.fromCharCode(c.charCodeAt(0) - 1584);
  });
}
