import { graphDelete, graphGet, graphPost } from "./graph";
import { blockInboxCommentAuthor, moderateInboxComment, readInboxComments, resourceHandle, type InboxContext } from "./inbox";

jest.mock("./graph", () => ({
  graphGet: jest.fn(), graphPost: jest.fn(), graphDelete: jest.fn(),
  GraphError: class extends Error { code?: number; constructor(code?: number) { super("graph"); this.code = code; } },
}));
const { GraphError } = jest.requireMock("./graph") as { GraphError: new (code?: number) => Error };
const get = jest.mocked(graphGet);
const post = jest.mocked(graphPost);
const del = jest.mocked(graphDelete);
const fb: InboxContext = { pageId: "page1", platform: "facebook", token: "T", igId: "ig1", secret: "s", userId: "admin1" };
const ig: InboxContext = { ...fb, platform: "instagram" };
const comment = (ctx: InboxContext) => resourceHandle(ctx, "comment", "c1");

beforeEach(() => jest.resetAllMocks());

it("hides a Facebook comment with is_hidden and an Instagram one with hide", async () => {
  post.mockResolvedValue({ success: true });
  await moderateInboxComment(fb, comment(fb), "hide");
  await moderateInboxComment(ig, comment(ig), "unhide");
  expect(post).toHaveBeenNthCalledWith(1, "c1", "T", { is_hidden: true });
  expect(post).toHaveBeenNthCalledWith(2, "c1", "T", { hide: false });
});

it("deletes with DELETE and rejects an unconfirmed result", async () => {
  del.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({});
  await expect(moderateInboxComment(fb, comment(fb), "delete")).resolves.toBeUndefined();
  expect(del).toHaveBeenCalledWith("c1", "T");
  await expect(moderateInboxComment(fb, comment(fb), "delete")).rejects.toThrow("لم تؤكد Meta");
});

it("refuses a comment handle signed for another page", async () => {
  await expect(moderateInboxComment(fb, resourceHandle({ ...fb, pageId: "other" }, "comment", "c1"), "delete")).rejects.toThrow();
  expect(del).not.toHaveBeenCalled();
});

it("blocks the author read from Meta, not from the browser", async () => {
  get.mockResolvedValue({ from: { id: "user9" } });
  post.mockResolvedValue({ user9: true });
  await blockInboxCommentAuthor(fb, comment(fb));
  expect(get).toHaveBeenCalledWith("c1", "T", { fields: "from" });
  expect(post).toHaveBeenCalledWith("page1/blocked", "T", { user: ["user9"] });
});

it("retries the block as psid when Meta rejects the user parameter", async () => {
  get.mockResolvedValue({ from: { id: "user9" } });
  post.mockRejectedValueOnce(new GraphError(100)).mockResolvedValueOnce({ user9: true });
  await blockInboxCommentAuthor(fb, comment(fb));
  expect(post).toHaveBeenLastCalledWith("page1/blocked", "T", { psid: ["user9"] });
});

it("never blocks the Page itself or on Instagram", async () => {
  get.mockResolvedValue({ from: { id: "page1" } });
  await expect(blockInboxCommentAuthor(fb, comment(fb))).rejects.toThrow("الصفحة نفسها");
  await expect(blockInboxCommentAuthor(ig, comment(ig))).rejects.toThrow("إنستغرام");
  expect(post).not.toHaveBeenCalled();
});

it("reads the hidden flag and falls back when Meta rejects the field", async () => {
  get.mockResolvedValueOnce({ data: [{ id: "c1", message: "x", from: { id: "u" }, is_hidden: true }] });
  const shown = await readInboxComments(fb, resourceHandle(fb, "post", "p1"), false);
  expect(shown.items[0].hidden).toBe(true);
  get.mockRejectedValueOnce(new GraphError(100)).mockResolvedValueOnce({ data: [{ id: "c2", message: "y", from: { id: "u" } }] });
  const fallback = await readInboxComments(fb, resourceHandle(fb, "post", "p1"), false);
  expect(fallback.items[0]).toMatchObject({ id: "c2" });
  expect(fallback.items[0].hidden).toBeUndefined();
  expect(get.mock.calls.at(-1)?.[2]).toMatchObject({ fields: "id,message,from,created_time" });
});
