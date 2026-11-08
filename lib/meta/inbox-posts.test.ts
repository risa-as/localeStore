import { graphGet, graphPost } from "./graph";
import { listInboxPosts, readInboxPostText, resourceHandle, resourceId, type InboxContext } from "./inbox";

jest.mock("./graph", () => ({ graphGet: jest.fn(), graphPost: jest.fn(), graphDelete: jest.fn(),
  GraphError: jest.requireActual("./graph").GraphError }));
const get = jest.mocked(graphGet);
const post = jest.mocked(graphPost);
const fb: InboxContext = { pageId: "page1", platform: "facebook", token: "T", igId: "ig1", secret: "s", userId: "admin1" };

beforeEach(() => {
  jest.resetAllMocks();
  post.mockImplementation(async (_path, _token, body) =>
    (body.batch as { relative_url: string }[]).map(request => ({ code: 200,
      body: JSON.stringify({ id: request.relative_url.split("?")[0] }) })));
});

const batchObjects = (objects: object[]) => objects.map(object => ({ code: 200, body: JSON.stringify(object) }));

const comments = (total: number, from = "customer", time = "2026-11-04T11:00:00+0000") =>
  ({ data: total ? [{ id: "c", message: "كم السعر", from: { id: from, name: "علي" }, created_time: time }] : [], summary: { total_count: total } });

it("orders posts by latest activity, so an old post with a new comment comes first", async () => {
  get.mockResolvedValueOnce({ data: [
    { id: "page1_new", created_time: "2026-11-01T00:00:00+0000", updated_time: "2026-11-01T00:00:00+0000" },
    { id: "page1_jan", created_time: "2026-01-30T00:00:00+0000", updated_time: "2026-11-04T11:00:00+0000" },
    { id: "page1_quiet", created_time: "2026-10-01T00:00:00+0000", updated_time: "2026-10-02T00:00:00+0000" },
  ] });
  post.mockResolvedValueOnce(batchObjects([
    { id: "page1_jan", message: "عدة سوكيت", comments: comments(49) },
    { id: "page1_new", message: "منشار", comments: comments(3, "page1", "2026-11-01T00:00:00+0000") },
    { id: "page1_quiet", message: "بلا تعليقات", comments: comments(0) },
  ]));
  const page = await listInboxPosts(fb);
  expect(page.items.map(item => item.id)).toEqual(["page1_jan", "page1_new"]);
  expect(page.items[0]).toMatchObject({ outgoing: false, commentCount: 49, preview: "علي: كم السعر", time: "2026-11-04T11:00:00+0000" });
  expect(page.items[1]).toMatchObject({ outgoing: true, preview: "أنت: كم السعر" });
  expect(resourceId(fb, "post", page.items[0].handle)).toBe("page1_jan");
  const requests = post.mock.calls[0][2].batch as { method: string; relative_url: string }[];
  expect(requests.map(request => request.method)).toEqual(["GET", "GET", "GET"]);
  expect(requests.map(request => request.relative_url.split("?")[0])).toEqual(["page1_jan", "page1_new", "page1_quiet"]);
  expect(new URLSearchParams(requests[0].relative_url.split("?")[1]).get("fields"))
    .toContain("comments.filter(stream).order(reverse_chronological)");
  expect(get.mock.calls.every(call => !call[2]?.ids)).toBe(true);
  expect(page.after).toBeNull();
});

it("includes ad-only posts of this Page and ignores other Pages' ads", async () => {
  get.mockResolvedValueOnce({ data: [{ id: "page1_org", updated_time: "2026-11-01T00:00:00+0000" }] });
  post.mockResolvedValueOnce(batchObjects([{ id: "page1_ad", updated_time: "2026-11-04T09:06:00+0000" }]))
    .mockResolvedValueOnce(batchObjects([
      { id: "page1_ad", message: "ثني الأنابيب", comments: comments(4) },
      { id: "page1_org", message: "منشور", comments: comments(1, "customer", "2026-11-01T00:00:00+0000") },
    ]));
  const page = await listInboxPosts({ ...fb, pageId: "page1" }, undefined, ["page1_ad", "other_ad"]);
  expect(page.items.map(item => item.id)).toEqual(["page1_ad", "page1_org"]);
  expect(JSON.stringify(post.mock.calls)).not.toContain("other_ad");
});

it("reads an ad's landing link from its button for product detection", async () => {
  get.mockResolvedValueOnce({ id: "page1_ad", message: "نص الإعلان", call_to_action: { value: { link: "https://store.test/ar/landing/adh-syanh?fbclid=x" } } });
  await expect(readInboxPostText(fb, resourceHandle(fb, "post", "page1_ad")))
    .resolves.toEqual({ id: "page1_ad", text: "نص الإعلان\nhttps://store.test/ar/landing/adh-syanh?fbclid=x" });
  expect(get).toHaveBeenCalledWith("page1_ad", "T", { fields: "id,message,call_to_action" });
});

it("pages through the sorted list with an offset cursor and rejects anything else", async () => {
  get.mockResolvedValueOnce({ data: Array.from({ length: 40 }, (_, i) => ({ id: `page1_${i}`, updated_time: new Date(Date.UTC(2026, 9, 1 + i)).toISOString() })) });
  const first = await listInboxPosts(fb);
  expect(first.after).toBe("offset:30");
  await listInboxPosts(fb, first.after!);
  // The second page reuses the scan instead of listing every post again.
  expect(get).toHaveBeenCalledTimes(1);
  expect(post.mock.calls[1][2].batch).toHaveLength(10);
  await expect(listInboxPosts(fb, "abc")).rejects.toThrow("مؤشر غير صالح");
});

it("keeps readable posts when one batch entry was deleted, but reports permission errors", async () => {
  get.mockResolvedValue({ data: [{ id: "page1_good" }, { id: "page1_deleted" }] });
  post.mockResolvedValueOnce([
    ...batchObjects([{ id: "page1_good", comments: comments(1) }]),
    { code: 400, body: JSON.stringify({ error: { code: 100, error_subcode: 33 } }) },
  ]);
  expect((await listInboxPosts(fb)).items.map(item => item.id)).toEqual(["page1_good"]);
  post.mockResolvedValueOnce([
    { code: 403, body: JSON.stringify({ error: { code: 200, message: "Missing permission" } }) },
    ...batchObjects([{ id: "page1_deleted" }]),
  ]);
  await expect(listInboxPosts(fb)).rejects.toThrow("Missing permission");
});
