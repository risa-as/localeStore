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
  constructor(status: number, message: string, code?: number) {
    super(message);
    this.name = "GraphError";
    this.status = status;
    this.code = code;
  }
}

async function parse(res: Response) {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error;
    throw new GraphError(
      res.status,
      err?.message || `Graph API ${res.status}`,
      err?.code,
    );
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
  });
  return parse(res) as Promise<T>;
}

export async function graphPost<T = Record<string, unknown>>(
  path: string,
  token: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${BASE}/${path.replace(/^\//, "")}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
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
  const res = await fetch(url);
  return parse(res) as Promise<{
    access_token: string;
    expires_in?: number;
    token_type?: string;
  }>;
}
