import { adminKms } from "./admin-kms";

describe("adminKms", () => {
  it("should work", () => {
    expect(adminKms()).toEqual("admin-kms");
  });
});
