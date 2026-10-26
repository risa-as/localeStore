import { advanceWaStatus } from "./whatsapp-status";

it("handles delayed and contradictory delivery callbacks", () => {
  expect(advanceWaStatus("read", "sent")).toBe("read");
  expect(advanceWaStatus("delivered", "failed")).toBe("delivered");
  expect(advanceWaStatus("sent", "failed")).toBe("failed");
  expect(advanceWaStatus("failed", "delivered")).toBe("delivered");
  expect(advanceWaStatus("failed", "sent")).toBe("failed");
});
