import { graphGet, graphPost } from "./graph";
import { replyToComment, resourceHandle, type InboxContext } from "./inbox";

jest.mock("./graph", () => ({
  graphGet: jest.fn(), graphPost: jest.fn(), graphDelete: jest.fn(),
  GraphError: class extends Error {
    code?: number; status = 400; outcomeUnknown?: boolean;
    constructor(code?: number, outcomeUnknown?: boolean) { super("graph"); this.code = code; this.outcomeUnknown = outcomeUnknown; }
  },
}));
const { GraphError } = jest.requireMock("./graph") as { GraphError: new (code?: number, outcomeUnknown?: boolean) => Error };
const get = jest.mocked(graphGet);
const post = jest.mocked(graphPost);
const fb: InboxContext = { pageId: "page1", platform: "facebook", token: "T", igId: "ig1", secret: "s", userId: "admin1" };
const ig: InboxContext = { ...fb, platform: "instagram" };
const handle = (ctx: InboxContext) => resourceHandle(ctx, "comment", "c1");
const both = { publicText: "راسلناك بالخاص", privateText: "السعر 25", skipIfReplied: false };

beforeEach(() => jest.resetAllMocks());

it("sends the private message first, then the public reply", async () => {
  get.mockResolvedValue({ can_reply_privately: true });
  post.mockResolvedValueOnce({ message_id: "dm1" }).mockResolvedValueOnce({ id: "pub1" });
  await expect(replyToComment(fb, handle(fb), both)).resolves.toEqual({ status: "sent", privateId: "dm1", publicId: "pub1" });
  expect(post).toHaveBeenNthCalledWith(1, "page1/messages", "T", { recipient: { comment_id: "c1" }, message: { text: "السعر 25" } });
  expect(post).toHaveBeenNthCalledWith(2, "c1/comments", "T", { message: "راسلناك بالخاص" });
});

it("posts nothing public when Facebook does not allow the private message", async () => {
  get.mockResolvedValue({ can_reply_privately: false });
  await expect(replyToComment(fb, handle(fb), both)).resolves.toMatchObject({ status: "skipped", reason: "private-unavailable" });
  get.mockResolvedValue({ can_reply_privately: true, private_reply_conversation: { id: "conv" } });
  await expect(replyToComment(fb, handle(fb), both)).resolves.toMatchObject({ status: "skipped", reason: "private-sent" });
  expect(post).not.toHaveBeenCalled();
});

it("skips an Instagram comment whose private reply Meta rejects, without posting publicly", async () => {
  post.mockRejectedValueOnce(new GraphError(10900));
  await expect(replyToComment(ig, handle(ig), both)).resolves.toMatchObject({ status: "skipped", reason: "private-rejected" });
  expect(post).toHaveBeenCalledTimes(1);
});

it("stops on rate limits and unknown outcomes instead of skipping", async () => {
  post.mockRejectedValueOnce(new GraphError(368));
  await expect(replyToComment(ig, handle(ig), both)).rejects.toThrow();
  post.mockRejectedValueOnce(new GraphError(undefined, true));
  await expect(replyToComment(ig, handle(ig), both)).rejects.toThrow();
});

it("reports a partial result when only the public reply fails", async () => {
  get.mockResolvedValue({ can_reply_privately: true });
  post.mockResolvedValueOnce({ message_id: "dm1" }).mockRejectedValueOnce(new GraphError(1));
  await expect(replyToComment(fb, handle(fb), both)).resolves.toMatchObject({ status: "partial", privateId: "dm1" });
});

it("skips a comment the Page already answered when asked to", async () => {
  get.mockResolvedValueOnce({ data: [{ id: "r1", from: { id: "someone" } }, { id: "r2", from: { id: "page1" } }] });
  await expect(replyToComment(fb, handle(fb), { ...both, skipIfReplied: true })).resolves.toMatchObject({ status: "skipped", reason: "replied" });
  expect(post).not.toHaveBeenCalled();
});

it("sends only the public reply when there is no private part", async () => {
  get.mockResolvedValueOnce({ data: [] });
  post.mockResolvedValueOnce({ id: "pub1" });
  await expect(replyToComment(ig, handle(ig), { publicText: "شكراً", privateText: "", skipIfReplied: true }))
    .resolves.toEqual({ status: "sent", privateId: undefined, publicId: "pub1" });
  expect(get).toHaveBeenCalledWith("c1/replies", "T", { fields: "id,from,username", limit: "50" });
  expect(post).toHaveBeenCalledWith("c1/replies", "T", { message: "شكراً" });
});
