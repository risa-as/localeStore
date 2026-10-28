import { graphGet, graphPost } from "./graph";
import { resourceHandle, resourceId, replyWindow, readInboxMessages, listInboxConversations,
  sendInboxMessage, sendInboxMediaMessage, sendInboxComment, markInboxConversationRead, commentOriginNotice, readInboxOrigin, readInboxComments, type InboxContext } from "./inbox";

jest.mock("./graph", () => ({ graphGet: jest.fn(), graphPost: jest.fn(), GraphError: class extends Error {} }));
const get = jest.mocked(graphGet);
const post = jest.mocked(graphPost);
const NOW = Date.parse("2026-10-23T10:00:00Z");
const ctx: InboxContext = { pageId: "page1", platform: "facebook", token: "PRIVATE_TOKEN",
  igId: "ig1", secret: "test-secret", userId: "admin1" };
const incoming = (hours: number) => ({ id: "m1", from: { id: "customer1" }, created_time: new Date(NOW - hours * 3600000).toISOString() });
const originText = "‏أنشأ فيسبوك هذه الدردشة نظرًا لقيام ‏‎Customer‎‏ بالتعليق على منشورك. لن يكون بإمكان الزبون رؤية هذا إلى أن تبدأ محادثة. عرض التعليق(https://facebook.com/story.php?comment_id=123)‏";

beforeEach(() => { jest.resetAllMocks(); jest.spyOn(Date, "now").mockReturnValue(NOW); });
afterEach(() => jest.restoreAllMocks());

describe("Facebook comment-started private replies", () => {
  const at = NOW - 3600000;
  const notice = { id: "notice", from: { id: "customer1" }, message: originText,
    created_time: new Date(at).toISOString() };
  const copy = { id: "copy", from: { id: "customer1" }, message: "25000 مع التوصیل",
    created_time: new Date(at + 2000).toISOString() };
  function source(messages = [copy, notice], comment = {}, originalPost = {}) {
    get.mockResolvedValueOnce({ data: messages })
      .mockResolvedValueOnce({ id: "456_123", message: copy.message, object: { id: "post1" },
        created_time: new Date(at - 6000).toISOString(), can_reply_privately: true, ...comment })
      .mockResolvedValueOnce({ id: "post1", from: { id: ctx.pageId }, message: "Original post", ...originalPost });
  }
  const handle = () => resourceHandle(ctx, "conversation", "thread1");

  it("excludes Meta's copy inserted two seconds after its notice and offers the seven-day private reply", async () => {
    expect(replyWindow(ctx, [copy, notice])).toMatchObject({ canReply: false, reason: "comment-origin" });
    source();
    const detail = await readInboxMessages(ctx, handle());
    expect(detail.window).toMatchObject({ canReply: true, mode: "private-reply", originMessageId: "notice",
      expiresAt: new Date(at - 6000 + 7 * 86400000).toISOString() });
    expect(detail.items.find(item => item.id === "copy")?.commentCopy).toBe(true);
    expect(post).not.toHaveBeenCalled();
  });
  it("uses the verified comment ID rather than PSID for the first reply, without a fallback POST", async () => {
    source(); post.mockResolvedValue({ message_id: "sent1" });
    const guard = jest.fn().mockResolvedValue(undefined);
    await expect(sendInboxMessage(ctx, handle(), "reply", guard)).resolves.toMatchObject({
      id: "sent1", previousMessageIds: ["copy", "notice"], replyMode: "private-reply", originMessageId: "notice",
    });
    expect(guard).toHaveBeenCalledWith("notice");
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("page1/messages", ctx.token, {
      recipient: { comment_id: "456_123" }, message: { text: "reply" },
    });
  });
  it("never retries or falls back to a normal DM if the private send is rejected", async () => {
    source(); post.mockRejectedValue(new Error("Rejected"));
    await expect(sendInboxMessage(ctx, handle(), "reply")).rejects.toThrow("Rejected");
    expect(post).toHaveBeenCalledTimes(1);
  });
  it("honors a persisted reply guard before any external write", async () => {
    source();
    await expect(sendInboxMessage(ctx, handle(), "reply", async () => { throw new Error("Already sent"); }))
      .rejects.toThrow("Already sent");
    expect(post).not.toHaveBeenCalled();
  });
  it.each(["image", "video"] as const)("refuses %s as the first private reply", async kind => {
    source();
    await expect(sendInboxMediaMessage(ctx, handle(), { kind, url: "https://demo.ufs.sh/f/media", name: "file", size: 10 }))
      .rejects.toThrow("نصي فقط");
    expect(post).not.toHaveBeenCalled();
  });
  it.each([
    { label: "Meta disallows private replies", comment: { can_reply_privately: false } },
    { label: "a native Meta reply was already sent", comment: { private_reply_conversation: { id: "thread1" } } },
    { label: "the seven-day deadline passed", comment: { created_time: new Date(NOW - 7 * 86400000).toISOString() } },
    { label: "source date is missing", comment: { created_time: undefined } },
    { label: "post belongs to another Page", comment: {}, originalPost: { from: { id: "foreign" } } },
  ])("does not send when $label", async ({ comment, originalPost }) => {
    source(undefined, comment, originalPost);
    await expect(sendInboxMessage(ctx, handle(), "reply")).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });
  it("waits for the customer when an outgoing reply is already in Meta history", async () => {
    source([{ id: "sent", from: { id: ctx.pageId }, message: "Reply", created_time: new Date(at + 10000).toISOString() }, copy, notice]);
    const detail = await readInboxMessages(ctx, handle());
    expect(detail.window).toMatchObject({ canReply: false, mode: "private-reply", reason: "private-reply-sent" });
  });
  it("fails closed when the source comment cannot be fetched", async () => {
    get.mockResolvedValueOnce({ data: [copy, notice] }).mockRejectedValueOnce(new Error("Unavailable"));
    await expect(sendInboxMessage(ctx, handle(), "reply")).rejects.toThrow("تعذر تأكيد");
    expect(post).not.toHaveBeenCalled();
  });
  it("accepts a genuine first DM shortly after the notice when it differs from the source comment", async () => {
    source([{ ...copy, message: "مرحبا أريد الحجز" }, notice]); post.mockResolvedValue({ message_id: "sent" });
    await sendInboxMessage(ctx, handle(), "reply");
    expect(post).toHaveBeenCalledWith("page1/messages", ctx.token, {
      recipient: { id: "customer1" }, messaging_type: "RESPONSE", message: { text: "reply" },
    });
  });
  it("lets a later real DM open the 24-hour window even if it repeats the comment text", async () => {
    const real = { ...copy, id: "real", created_time: new Date(at + 600000).toISOString() };
    get.mockResolvedValueOnce({ data: [real, copy, notice] }); post.mockResolvedValue({ message_id: "sent" });
    await sendInboxMessage(ctx, handle(), "reply");
    expect(get).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("page1/messages", ctx.token, expect.objectContaining({ recipient: { id: "customer1" } }));
  });
  it("does not try to mark a comment-only conversation as seen through the DM API", async () => {
    source();
    expect(await markInboxConversationRead(ctx, handle(), "copy"))
      .toMatchObject({ marked: true, metaSyncRequired: false, metaSynced: false });
    expect(post).not.toHaveBeenCalled();
  });
});

it.each(["facebook", "instagram"] as const)("retains the actual author identity for %s comment grouping", async platform => {
  const context = { ...ctx, platform };
  get.mockResolvedValue({ data: [{ id: "comment1", from: { id: "customer1", name: "Same Name" }, username: "unique_user", message: "السعر؟", text: "السعر؟" }] });
  const result = await readInboxComments(context, resourceHandle(context, "post", "post1"), false);
  expect(result.items[0]).toMatchObject({ id: "comment1", authorId: "customer1", authorUsername: "unique_user", outgoing: false });
  expect(resourceId(context, "comment", result.items[0].handle)).toBe("comment1");
});

it.each(["image", "video"] as const)("sends %s as a real attachment to the server-derived recipient", async kind => {
  get.mockResolvedValue({ data: [incoming(1)] });
  post.mockResolvedValue({ message_id: "sent-media" });
  const media = { kind, url: "https://demo.ufs.sh/f/media", name: "file", size: 100 };
  await expect(sendInboxMediaMessage(ctx, resourceHandle(ctx, "conversation", "thread1"), media)).resolves.toEqual({ id: "sent-media", previousMessageIds: ["m1"] });
  expect(post).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledWith("page1/messages", ctx.token, {
    recipient: { id: "customer1" }, messaging_type: "RESPONSE", message: { attachment: { type: kind, payload: { url: media.url } } },
  });
});
it("does not upload/send media into an expired messaging window", async () => {
  get.mockResolvedValue({ data: [incoming(25)] });
  await expect(sendInboxMediaMessage(ctx, resourceHandle(ctx, "conversation", "thread1"), {
    kind: "video", url: "https://demo.ufs.sh/f/video", name: "v.mp4", size: 100,
  })).rejects.toThrow("مغلقة");
  expect(post).not.toHaveBeenCalled();
});

it("resolves comment and post context only from server-fetched conversation history", async () => {
  get.mockResolvedValueOnce({ data: [{ ...incoming(1), message: originText }] })
    .mockResolvedValueOnce({ id: "123", message: "السعر؟", from: { name: "Customer" }, object: { id: "post1" } })
    .mockResolvedValueOnce({ id: "post1", message: "Product post", from: { id: ctx.pageId }, permalink_url: "https://facebook.com/post1" });
  const result = await readInboxOrigin(ctx, resourceHandle(ctx, "conversation", "thread1"));
  expect(result?.comment.text).toBe("السعر؟");
  expect(result?.post?.text).toBe("Product post");
  expect(JSON.stringify(result)).not.toContain(ctx.token);
  expect(post).not.toHaveBeenCalled();
  get.mockClear();
  await expect(readInboxOrigin(ctx, "forged")).rejects.toThrow();
  expect(get).not.toHaveBeenCalled();
});
it("keeps the comment usable when its original post is unavailable", async () => {
  get.mockResolvedValueOnce({ data: [{ ...incoming(1), message: originText }] })
    .mockResolvedValueOnce({ id: "123", message: "السعر؟", object: { id: "post1" } })
    .mockRejectedValueOnce(new Error("Post unavailable"));
  expect((await readInboxOrigin(ctx, resourceHandle(ctx, "conversation", "thread1")))?.post).toBeNull();
});
it("uses the notice's matching GraphQL reference when Meta omits the comment object", async () => {
  const notice = originText.replace("comment_id=123", `comment_id=123&comment_gqlid=${Buffer.from("comment:456_123").toString("base64")}`);
  get.mockResolvedValueOnce({ data: [{ ...incoming(1), message: notice }] })
    .mockResolvedValueOnce({ id: "123", message: "السعر؟" })
    .mockResolvedValueOnce({ id: "page1_456", message: "Product post", from: { id: ctx.pageId } });
  expect((await readInboxOrigin(ctx, resourceHandle(ctx, "conversation", "thread1")))?.post?.text).toBe("Product post");
  expect(get).toHaveBeenLastCalledWith("page1_456", ctx.token, expect.anything());
});

it("resolves pfbid post_id notices and shows the post cover image inline", async () => {
  const notice = originText.replace("comment_id=123", "comment_id=123&post_id=page1_pfbidExample&id=page1&story_fbid=pfbidExample");
  get.mockResolvedValueOnce({ data: [{ ...incoming(1), message: notice }] })
    .mockResolvedValueOnce({ id: "123", message: "متوفر؟" })
    .mockResolvedValueOnce({ id: "page1_456", message: "قاعدة كوسرة زاوية", from: { id: ctx.pageId }, full_picture: "https://scontent.example.fbcdn.net/post.jpg" });
  const result = await readInboxOrigin(ctx, resourceHandle(ctx, "conversation", "thread1"));
  expect(result?.post).toMatchObject({ text: "قاعدة كوسرة زاوية", attachments: [{ kind: "image", url: "https://scontent.example.fbcdn.net/post.jpg" }] });
  expect(get).toHaveBeenLastCalledWith("page1_pfbidExample", ctx.token, expect.objectContaining({ fields: expect.stringContaining("full_picture") }));
});
it.each(["post_id", "story_fbid"])("resolves a public profile alias in %s using the Page Graph ID", async field => {
  const publicId = "100086300637503";
  const opaqueId = "pfbid0cLrmjqj6rp4iVLAK36wxKHmk2k6YQHpMrVqLix5JudpkmLZ2T18wWQ5CB4rrc8bGl";
  const hint = field === "post_id" ? `post_id=${publicId}_${opaqueId}` : `story_fbid=${opaqueId}`;
  const notice = originText.replace("comment_id=123", `comment_id=123&id=${publicId}&${hint}`);
  get.mockResolvedValueOnce({ data: [{ ...incoming(1), message: notice }] })
    .mockResolvedValueOnce({ id: "123", message: "ممكن واحد للفلوجه" })
    .mockResolvedValueOnce({ id: "page1_1092074520345892", message: "Actual product caption", from: { id: ctx.pageId }, full_picture: "https://scontent.example.fbcdn.net/post.jpg" });
  const result = await readInboxOrigin(ctx, resourceHandle(ctx, "conversation", "thread1"));
  expect(result?.post).toMatchObject({ id: "page1_1092074520345892", text: "Actual product caption" });
  expect(get).toHaveBeenLastCalledWith(`page1_${opaqueId}`, ctx.token, expect.anything());
});
it("still rejects a pfbid that resolves to a different Page", async () => {
  const notice = originText.replace("comment_id=123", "comment_id=123&id=other&story_fbid=pfbidForeignPost");
  get.mockResolvedValueOnce({ data: [{ ...incoming(1), message: notice }] })
    .mockResolvedValueOnce({ id: "123", message: "Comment" })
    .mockResolvedValueOnce({ id: "other_456", message: "Foreign post", from: { id: "other" } });
  expect((await readInboxOrigin(ctx, resourceHandle(ctx, "conversation", "thread1")))?.post).toBeNull();
});
it("can show an available story_fbid post when the comment itself is inaccessible", async () => {
  get.mockResolvedValueOnce({ data: [{ ...incoming(1), message: originText.replace("comment_id=123", "comment_id=123&id=page1&story_fbid=456") }] })
    .mockRejectedValueOnce(new Error("Comment deleted"))
    .mockResolvedValueOnce({ id: "page1_456", message: "Original caption", from: { id: ctx.pageId } });
  const result = await readInboxOrigin(ctx, resourceHandle(ctx, "conversation", "thread1"));
  expect(result?.post?.text).toBe("Original caption"); expect(result?.commentUnavailable).toBe(true);
  expect(post).not.toHaveBeenCalled();
});
it("does not resolve cross-Page post hints or accept a foreign post as its own", async () => {
  get.mockResolvedValueOnce({ data: [{ ...incoming(1), message: originText.replace("comment_id=123", "comment_id=123&post_id=other_456&id=other&story_fbid=456") }] })
    .mockResolvedValueOnce({ id: "123", message: "Comment" });
  expect((await readInboxOrigin(ctx, resourceHandle(ctx, "conversation", "thread1")))?.post).toBeNull();
  expect(get).toHaveBeenCalledTimes(2);
  get.mockReset();
  get.mockResolvedValueOnce({ data: [{ ...incoming(1), message: originText }] })
    .mockResolvedValueOnce({ id: "123", object: { id: "other_456" } })
    .mockResolvedValueOnce({ id: "other_456", message: "Foreign content", from: { id: "other" } });
  expect((await readInboxOrigin(ctx, resourceHandle(ctx, "conversation", "thread1")))?.post).toBeNull();
});
it("does not embed an untrusted post image host", async () => {
  get.mockResolvedValueOnce({ data: [{ ...incoming(1), message: originText }] })
    .mockResolvedValueOnce({ id: "123", object: { id: "post1" } })
    .mockResolvedValueOnce({ id: "post1", from: { id: ctx.pageId }, full_picture: "https://external.example/pixel.jpg" });
  expect((await readInboxOrigin(ctx, resourceHandle(ctx, "conversation", "thread1")))?.post?.attachments).toBeUndefined();
});
it("resolves the specific notice instead of showing another notice's post", async () => {
  get.mockResolvedValueOnce({ data: [
    { ...incoming(1), id: "new-notice", message: originText.replace("comment_id=123", "comment_id=999") },
    { ...incoming(2), id: "old-notice", message: originText },
  ] }).mockResolvedValueOnce({ id: "123", message: "Original comment", object: { id: "post1" } })
    .mockResolvedValueOnce({ id: "post1", message: "Original post", from: { id: ctx.pageId } });
  const result = await readInboxOrigin(ctx, resourceHandle(ctx, "conversation", "thread1"), "old-notice");
  expect(result?.comment.id).toBe("123");
  expect(get).toHaveBeenNthCalledWith(2, "123", ctx.token, expect.anything());
});
it("does not substitute another notice when the requested one is unavailable", async () => {
  get.mockResolvedValueOnce({ data: [{ ...incoming(1), id: "other-notice", message: originText }] });
  expect(await readInboxOrigin(ctx, resourceHandle(ctx, "conversation", "thread1"), "missing-notice")).toBeNull();
  expect(get).toHaveBeenCalledTimes(1);
});

describe("social inbox boundaries", () => {
  it("rejects tampered, expired, cross-page, cross-platform and cross-user handles", () => {
    const handle = resourceHandle(ctx, "conversation", "thread1");
    expect(resourceId(ctx, "conversation", handle)).toBe("thread1");
    expect(() => resourceId(ctx, "conversation", `${handle}x`)).toThrow();
    expect(() => resourceId({ ...ctx, pageId: "page2" }, "conversation", handle)).toThrow();
    expect(() => resourceId({ ...ctx, platform: "instagram" }, "conversation", handle)).toThrow();
    expect(() => resourceId({ ...ctx, userId: "admin2" }, "conversation", handle)).toThrow();
    expect(() => resourceId(ctx, "comment", handle)).toThrow();
    expect(() => resourceId(ctx, "conversation", handle, NOW + 86400000)).toThrow();
  });

  it("does not let an outgoing or future message renew the 24-hour window", () => {
    const recentOutbound = { id: "m2", from: { id: ctx.pageId }, created_time: new Date(NOW).toISOString() };
    expect(replyWindow(ctx, [incoming(25), recentOutbound]).canReply).toBe(false);
    expect(replyWindow(ctx, [incoming(-1)]).canReply).toBe(false);
    expect(replyWindow(ctx, [incoming(24)]).canReply).toBe(false);
    expect(replyWindow(ctx, [incoming(23)]).canReply).toBe(true);
  });

  it("refuses expired windows before making any external write", async () => {
    get.mockResolvedValue({ data: [incoming(25)] });
    await expect(sendInboxMessage(ctx, resourceHandle(ctx, "conversation", "thread1"), "hello")).rejects.toThrow("مغلقة");
    expect(post).not.toHaveBeenCalled();
  });

  it("derives the recipient and rechecks the window from Meta at send time", async () => {
    get.mockResolvedValue({ data: [incoming(1)] });
    post.mockResolvedValue({ message_id: "sent1" });
    expect(await sendInboxMessage(ctx, resourceHandle(ctx, "conversation", "thread1"), "hello"))
      .toEqual({ id: "sent1", previousMessageIds: ["m1"] });
    expect(post).toHaveBeenCalledWith("page1/messages", ctx.token, {
      recipient: { id: "customer1" }, messaging_type: "RESPONSE", message: { text: "hello" },
    });
  });

  it("does not expose tokens or Meta next URLs while preserving pagination", async () => {
    get.mockResolvedValue({ data: [{ id: "thread1", participants: { data: [{ id: "customer1", name: "Customer" }] } }],
      paging: { next: "https://graph.facebook.com/next?access_token=PRIVATE_TOKEN", cursors: { after: "cursor2" } } });
    const result = await listInboxConversations(ctx);
    expect(result.after).toBe("cursor2");
    expect(JSON.stringify(result)).not.toContain(ctx.token);
    expect(JSON.stringify(result)).not.toContain("graph.facebook.com");
    expect(resourceId(ctx, "conversation", result.items[0].handle)).toBe("thread1");
  });

  it("does not infer a reply window from an older page of history", async () => {
    get.mockResolvedValue({ data: [incoming(1)] });
    expect((await readInboxMessages(ctx, resourceHandle(ctx, "conversation", "thread1"), "older")).window).toBeNull();
  });

  it("renders comment-origin notices separately and extracts the comment link", async () => {
    get.mockResolvedValue({ data: [{ ...incoming(1), message: originText }] });
    const result = await readInboxMessages(ctx, resourceHandle(ctx, "conversation", "thread1"));
    expect(result.items[0]).toMatchObject({ system: "comment-origin", title: "إشعار من فيسبوك",
      commentUrl: "https://facebook.com/story.php?comment_id=123" });
    expect(result.items[0].outgoing).toBeUndefined();
    expect(result.items[0].text).not.toContain("https://");
    expect(result.window).toMatchObject({ canReply: false, mode: "private-reply", reason: "comment-unavailable" });
  });

  it("does not treat a prefilled comment or its system notice as an inbound DM", async () => {
    const notice = { ...incoming(1), id: "notice", message: originText };
    const commentCopy = { ...incoming(1), id: "comment-copy", message: "كم السعر؟" };
    expect(replyWindow(ctx, [notice, commentCopy]).canReply).toBe(false);
    expect(replyWindow(ctx, [notice, commentCopy, incoming(0.5)]).canReply).toBe(true);
    get.mockResolvedValue({ data: [notice, commentCopy] });
    await expect(sendInboxMessage(ctx, resourceHandle(ctx, "conversation", "thread1"), "reply")).rejects.toThrow("تعذر تأكيد");
    expect(post).not.toHaveBeenCalled();
  });

  it("never makes an external or insecure link into a comment action", () => {
    expect(commentOriginNotice(originText.replace("https://facebook.com", "https://facebook.com.evil.example"))?.commentUrl).toBeUndefined();
    expect(commentOriginNotice(originText.replace("https://facebook.com", "http://facebook.com"))?.commentUrl).toBeUndefined();
    expect(commentOriginNotice("رسالة عادية من الزبون")).toBeNull();
  });

  it("maps Messenger's sticker to a single inline image instead of a technical filename", async () => {
    const url = "https://scontent.example.fbcdn.net/sticker.png";
    get.mockResolvedValue({ data: [{ ...incoming(1), sticker: url, attachments: { data: [{ name: "sticker-369239263222822",
      mime_type: "image/png", image_data: { url, width: 120, height: 120, render_as_sticker: true } }] } }] });
    const result = await readInboxMessages(ctx, resourceHandle(ctx, "conversation", "thread1"));
    expect(result.items[0].attachments).toEqual([{ name: "ملصق", kind: "sticker", url, width: 120, height: 120 }]);
    expect(result.items[0].text).toBe("");
    get.mockResolvedValue({ data: [{ id: "thread1", messages: { data: [{ ...incoming(1), sticker: url }] } }] });
    const list = await listInboxConversations(ctx);
    expect(list.items[0].text).toBe("ملصق");
  });

  it("supports sticker-only messages and limits inline previews to Meta media hosts", async () => {
    get.mockResolvedValue({ data: [{ ...incoming(1), sticker: "https://scontent.example.fbcdn.net/sticker.png" },
      { ...incoming(1), id: "other", sticker: "https://external.example/tracker.png", attachments: { data: [
        { image_data: { url: "javascript:alert(1)" } }, { name: "image", image_data: { url: "https://external.example/image.png" } },
      ] } }] });
    const result = await readInboxMessages(ctx, resourceHandle(ctx, "conversation", "thread1"));
    expect(result.items[0].attachments?.[0]).toMatchObject({ kind: "sticker", name: "ملصق" });
    expect(result.items[1].attachments).toHaveLength(1);
    expect(result.items[1].attachments?.[0].kind).toBe("file");
  });

  it.each([
    { name: "audioclip-1792752236000-4528.mp4", mime_type: "audio/mpeg", file_url: "https://cdn.fbsbx.com/voice.mp4" },
    { name: "audioclip-123.mp4", mime_type: "video/mp4", file_url: "https://cdn.fbsbx.com/voice.mp4" },
    { name: "voice.m4a", file_url: "https://scontent.example.fbcdn.net/voice.m4a" },
    { audio_data: { url: "https://cdn.fbsbx.com/voice" } },
  ])("recognizes voice messages without mistaking the MP4 container for a video: %j", async attachment => {
    get.mockResolvedValue({ data: [{ ...incoming(1), attachments: { data: [attachment] } }] });
    const result = await readInboxMessages(ctx, resourceHandle(ctx, "conversation", "thread1"));
    expect(result.items[0].attachments?.[0]).toMatchObject({ kind: "audio", name: "رسالة صوتية" });
    expect(result.items[0].text).toBe("");
    get.mockResolvedValue({ data: [{ id: "thread1", messages: { data: [{ ...incoming(1), attachments: { data: [attachment] } }] } }] });
    expect((await listInboxConversations(ctx)).items[0].text).toBe("رسالة صوتية");
  });

  it.each([
    { name: "video.mp4", mime_type: "video/mp4", file_url: "https://video.example.fbcdn.net/video.mp4" },
    { video_data: { url: "https://cdn.fbsbx.com/video" }, image_data: { url: "https://cdn.fbsbx.com/poster.jpg" } },
    { file_url: "https://cdn.fbsbx.com/movie.webm" },
  ])("renders video file and video_data attachments as video, including those with a thumbnail: %j", async attachment => {
    get.mockResolvedValue({ data: [{ ...incoming(1), attachments: { data: [attachment] } }] });
    const result = await readInboxMessages(ctx, resourceHandle(ctx, "conversation", "thread1"));
    expect(result.items[0].attachments?.[0]).toMatchObject({ kind: "video", name: "فيديو" });
    get.mockResolvedValue({ data: [{ id: "thread1", messages: { data: [{ ...incoming(1), attachments: { data: [attachment] } }] } }] });
    expect((await listInboxConversations(ctx)).items[0].text).toBe("فيديو");
  });

  it("keeps external media as links and drops unsafe URLs", async () => {
    get.mockResolvedValue({ data: [{ ...incoming(1), attachments: { data: [
      { mime_type: "audio/mpeg", file_url: "https://cdn.fbsbx.com.evil.example/voice.mp3" },
      { mime_type: "video/mp4", file_url: "https://external.example/video.mp4" },
      { mime_type: "video/mp4", file_url: "javascript:alert(1)" },
      { mime_type: "audio/mpeg", file_url: "http://cdn.fbsbx.com/voice.mp3" },
    ] } }] });
    const result = await readInboxMessages(ctx, resourceHandle(ctx, "conversation", "thread1"));
    expect(result.items[0].attachments?.map(attachment => attachment.kind)).toEqual(["file", "file"]);
  });

  it("marks only the loaded conversation as seen using its server-derived recipient", async () => {
    get.mockResolvedValue({ data: [incoming(1)] });
    post.mockResolvedValue({ recipient_id: "customer1" });
    const result = await markInboxConversationRead(ctx, resourceHandle(ctx, "conversation", "thread1"), "m1");
    expect(result).toEqual({ marked: true, messageId: "m1", metaSynced: true });
    expect(post).toHaveBeenCalledWith("page1/messages", ctx.token, {
      recipient: { id: "customer1" }, sender_action: "mark_seen",
    });
  });

  it("does not mark a newer unread arrival as seen when acknowledging an older snapshot", async () => {
    get.mockResolvedValue({ data: [{ ...incoming(0), id: "new-arrival" }, incoming(1)] });
    expect(await markInboxConversationRead(ctx, resourceHandle(ctx, "conversation", "thread1"), "m1"))
      .toEqual({ marked: false });
    expect(post).not.toHaveBeenCalled();
  });

  it("rejects cross-page read acknowledgements before accessing Meta", async () => {
    const handle = resourceHandle({ ...ctx, pageId: "other-page" }, "conversation", "thread1");
    await expect(markInboxConversationRead(ctx, handle, "m1")).rejects.toThrow();
    expect(get).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it("still permits saving local read state when Meta refuses its seen indicator", async () => {
    get.mockResolvedValue({ data: [incoming(1)] });
    post.mockRejectedValue(new Error("Sender action unavailable"));
    expect(await markInboxConversationRead(ctx, resourceHandle(ctx, "conversation", "thread1"), "m1"))
      .toEqual({ marked: true, messageId: "m1", metaSynced: false });
  });

  it.each(["facebook", "instagram"] as const)("uses the public comment reply endpoint for %s", async platform => {
    const context = { ...ctx, platform };
    post.mockResolvedValue({ id: "reply1" });
    await sendInboxComment(context, resourceHandle(context, "comment", "comment1"), "reply");
    expect(post).toHaveBeenCalledWith(`comment1/${platform === "facebook" ? "comments" : "replies"}`, ctx.token, { message: "reply" });
  });
});
