import { suggestReturnReason } from "./return-reasons";
it("suggests a reason only when the reply has one clear category", () => {
  expect(suggestReturnReason("اني ما طلبت هذا المنتج")).toBe("did_not_order");
  expect(suggestReturnReason("السعر غالي والمندوب تأخر")).toBe("other");
  expect(suggestReturnReason("لا شكراً")).toBe("other");
});
