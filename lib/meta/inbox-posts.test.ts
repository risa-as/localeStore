import { graphGet } from "./graph";
import { listInboxPosts, readInboxPostText, resourceHandle, resourceId, type InboxContext } from "./inbox";

jest.mock("./graph", () => ({ graphGet: jest.fn(), graphPost: jest.fn(), graphDelete: jest.fn(), GraphError: class extends Error {} }));
const get = jest.mocked(graphGet);
const fb: InboxContext = { pageId: "page1", platform: "facebook", token: "T", igId: "ig1", secret: "s", userId: "admin1" };

beforeEach(() => jest.resetAllMocks());

const comments = (total: number, from = "customer", time = "2026-11-04T11:00:00+0000") =>
  ({ data: total ? [{ id: "c", message: "كم السعر", from: { id: from, name: "علي" }, created_time: time }] : [], summary: { total_count: total } });

it("orders posts by latest activity, so an old post with a new comment comes first", async () => {
  get.mockResolvedValueOnce({ data: [
    { id: "page1_new", created_time: "2026-11-01T00:00:00+0000", updated_time: "2026-11-01T00:00:00+0000" },
    { id: "page1_jan", created_time: "2026-01-30T00:00:00+0000", updated_time: "2026-11-04T11:00:00+0000" },
    { id: "page1_quiet", created_time: "2026-10-01T00:00:00+0000", updated_time: "2026-10-02T00:00:00+0000" },
  ] }).mockResolvedValueOnce({
    page1_jan: { id: "page1_jan", message: "عدة سوكيت", comments: comments(49) },
    page1_new: { id: "page1_new", message: "منشار", comments: comments(3, "page1", "2026-11-01T00:00:00+0000") },
    page1_quiet: { id: "page1_quiet", message: "بلا تعليقات", comments: comments(0) },
  });
  const page = await listInboxPosts(fb);
  expect(page.items.map(item => item.id)).toEqual(["page1_jan", "page1_new"]);
  expect(page.items[0]).toMatchObject({ outgoing: false, commentCount: 49, preview: "علي: كم السعر", time: "2026-11-04T11:00:00+0000" });
  expect(page.items[1]).toMatchObject({ outgoing: true, preview: "أنت: كم السعر" });
  expect(resourceId(fb, "post", page.items[0].handle)).toBe("page1_jan");
  expect(get.mock.calls[1][2]).toMatchObject({ ids: "page1_jan,page1_new,page1_quiet" });
  expect(String(get.mock.calls[1][2]?.fields)).toContain("comments.filter(stream).order(reverse_chronological)");
  expect(page.after).toBeNull();
});

it("includes ad-only posts of this Page and ignores other Pages' ads", async () => {
  get.mockImplementation(async (path: string, _token: string, params?: Record<string, string | undefined>) => {
    if (path === "page1/posts") return { data: [{ id: "page1_org", updated_time: "2026-11-01T00:00:00+0000" }] };
    if (params?.fields === "id,updated_time,created_time") return { page1_ad: { id: "page1_ad", updated_time: "2026-11-04T09:06:00+0000" } };
    return {
      page1_ad: { id: "page1_ad", message: "ثني الأنابيب", comments: comments(4) },
      page1_org: { id: "page1_org", message: "منشور", comments: comments(1, "customer", "2026-11-01T00:00:00+0000") },
    };
  });
  const page = await listInboxPosts({ ...fb, pageId: "page1" }, undefined, ["page1_ad", "other_ad"]);
  expect(page.items.map(item => item.id)).toEqual(["page1_ad", "page1_org"]);
  expect(get.mock.calls.some(call => String(call[2]?.ids).includes("other_ad"))).toBe(false);
});

it("reads an ad's landing link from its button for product detection", async () => {
  get.mockResolvedValueOnce({ id: "page1_ad", message: "نص الإعلان", call_to_action: { value: { link: "https://store.test/ar/landing/adh-syanh?fbclid=x" } } });
  await expect(readInboxPostText(fb, resourceHandle(fb, "post", "page1_ad")))
    .resolves.toEqual({ id: "page1_ad", text: "نص الإعلان\nhttps://store.test/ar/landing/adh-syanh?fbclid=x" });
  expect(get).toHaveBeenCalledWith("page1_ad", "T", { fields: "id,message,call_to_action" });
});

it("pages through the sorted list with an offset cursor and rejects anything else", async () => {
  get.mockResolvedValueOnce({ data: Array.from({ length: 40 }, (_, i) => ({ id: `page1_${i}`, updated_time: new Date(Date.UTC(2026, 9, 1 + i)).toISOString() })) })
    .mockResolvedValueOnce({});
  const first = await listInboxPosts(fb);
  expect(first.after).toBe("offset:30");
  get.mockResolvedValueOnce({});
  await listInboxPosts(fb, first.after!);
  // The second page reuses the scan instead of listing every post again.
  expect(get).toHaveBeenCalledTimes(3);
  expect(String(get.mock.calls[2][2]?.ids).split(",")).toHaveLength(10);
  await expect(listInboxPosts(fb, "abc")).rejects.toThrow("مؤشر غير صالح");
});
