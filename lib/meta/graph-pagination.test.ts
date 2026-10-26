import { graphGetAll, graphPost, GraphError } from "./graph";

afterEach(() => jest.restoreAllMocks());
it("marks a lost write response as uncertain and never retries automatically", async () => {
  const fetchMock = jest.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("network failed"));
  await expect(graphPost("page/messages", "SECRET", { message: { text: "PRIVATE" } })).rejects.toMatchObject({ outcomeUnknown: true, status: 0 });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("retains Meta's subcode and support trace without retrying a rejected send", async () => {
  const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
    error: { message: "This person isn't available right now.", code: 551,
      error_subcode: 1545041, fbtrace_id: "diagnostic-trace" },
  }, { status: 400 }));
  const error = await graphPost("page/messages", "SECRET", { message: { text: "PRIVATE_MESSAGE" } }).catch(e => e);
  expect(error).toBeInstanceOf(GraphError);
  expect(error).toMatchObject({ status: 400, code: 551, subcode: 1545041, traceId: "diagnostic-trace" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(error.message).not.toContain("SECRET");
  expect(error.message).not.toContain("PRIVATE_MESSAGE");
});
it("loads every asset page using cursors and never follows token-bearing next URLs", async () => {
  const fetchMock = jest.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(Response.json({ data: [{ id: "1" }], paging: { next: "https://untrusted.example/?access_token=SECRET", cursors: { after: "cursor2" } } }))
    .mockResolvedValueOnce(Response.json({ data: [{ id: "2" }] }));
  expect(await graphGetAll("me/accounts", "SECRET")).toEqual([{ id: "1" }, { id: "2" }]);
  const second = new URL(String(fetchMock.mock.calls[1][0]));
  expect(second.hostname).toBe("graph.facebook.com");
  expect(second.searchParams.get("after")).toBe("cursor2");
  expect(second.searchParams.has("access_token")).toBe(false);
});
it("rejects a repeated pagination cursor instead of hanging or claiming completeness", async () => {
  jest.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ data: [], paging: { next: "next", cursors: { after: "same" } } }));
  await expect(graphGetAll("me/accounts", "SECRET")).rejects.toThrow("إكمال");
});
