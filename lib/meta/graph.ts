import { META_GRAPH_VERSION } from "./config";

/**
 * مساعدات Graph API رفيعة بـ fetch الخام (لا نستخدم facebook-nodejs-business-sdk
 * هنا — الحزمة لها احتكاك مع TypeScript في هذا المشروع وتثبّت نسخة Graph مختلفة؛
 * نتركها لـ CAPI فقط). يعكس نمط graphPost في lib/whatsapp.ts.
 *
 * التوكن يُمرَّر كترويسة Bearer وليس في الرابط، حتى لا يتسرّب إلى السجلات.
 */

const BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export class GraphError extends Error {
  status: number;
  code?: number;
  subcode?: number;
  traceId?: string;
  outcomeUnknown?: boolean;
  constructor(status: number, message: string, code?: number, details?: { subcode?: number; traceId?: string; outcomeUnknown?: boolean }) {
    super(message);
    this.name = "GraphError";
    this.status = status;
    this.code = code;
    this.subcode = details?.subcode;
    this.traceId = details?.traceId;
    this.outcomeUnknown = details?.outcomeUnknown;
  }
}

async function parse(res: Response) {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error;
    // نجمع تفاصيل Meta الكاملة — «Invalid parameter» وحده لا يكفي؛ blame_field_specs
    // يذكر الحقل المرفوض، وerror_user_msg رسالة مقروءة.
    const parts: string[] = [err?.message || `Graph API ${res.status}`];
    const userMsg = err?.error_user_msg || err?.error_user_title;
    if (userMsg && userMsg !== err?.message) parts.push(userMsg);
    const blame = err?.error_data?.blame_field_specs;
    if (blame) parts.push(`الحقل: ${JSON.stringify(blame)}`);
    if (err?.error_subcode) parts.push(`subcode ${err.error_subcode}`);
    throw new GraphError(res.status, parts.join(" — "), err?.code, {
      subcode: typeof err?.error_subcode === "number" ? err.error_subcode : undefined,
      traceId: typeof err?.fbtrace_id === "string" ? err.fbtrace_id : undefined,
    });
  }
  return data;
}

export async function graphGet<T = Record<string, unknown>>(
  path: string,
  token: string,
  params?: Record<string, string | undefined>,
): Promise<T> {
  const url = new URL(`${BASE}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined) url.searchParams.set(k, v);
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return parse(res) as Promise<T>;
}

/** Follow Graph cursors without fetching (or returning) token-bearing next URLs. */
export async function graphGetAll<T>(path: string, token: string, params?: Record<string, string | undefined>): Promise<T[]> {
  const items: T[] = [];
  const seen = new Set<string>();
  let after: string | undefined;
  do {
    const result = await graphGet<{ data?: T[]; paging?: { next?: string; cursors?: { after?: string } } }>(
      path, token, { ...params, limit: "100", after });
    items.push(...(result.data ?? []));
    if (!result.paging?.next) return items;
    after = result.paging.cursors?.after;
    if (!after || seen.has(after) || seen.size >= 1000) throw new Error("تعذر إكمال صفحات نتائج Meta");
    seen.add(after);
  } while (after);
  return items;
}

export async function graphPost<T = Record<string, unknown>>(
  path: string,
  token: string,
  body: Record<string, unknown>,
): Promise<T> {
  let res: Response;
  try { res = await fetch(`${BASE}/${path.replace(/^\//, "")}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }); } catch {
    throw new GraphError(0, "لم نستلم تأكيد الإرسال من Meta؛ تحقّق من المحادثة قبل إعادة المحاولة", undefined, { outcomeUnknown: true });
  }
  return parse(res) as Promise<T>;
}

/**
 * تبادل التوكنات وتُستدعى بمعاملات في الرابط (لا Bearer) لأنها نقاط app-level:
 *   1) code → توكن قصير العمر
 *   2) توكن قصير → توكن طويل العمر (~60 يوماً)
 */
export async function oauthExchange(
  params: Record<string, string>,
): Promise<{ access_token: string; expires_in?: number; token_type?: string }> {
  const url = new URL(`${BASE}/oauth/access_token`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { cache: "no-store" });
  return parse(res) as Promise<{
    access_token: string;
    expires_in?: number;
    token_type?: string;
  }>;
}
