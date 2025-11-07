import { adminSsh } from "./admin-ssh";

describe("adminSsh", () => {
  it("should work", () => {
    expect(adminSsh()).toEqual("admin-ssh");
  });
});
