import { adminCredentials } from "./admin-credentials";

describe("adminCredentials", () => {
  it("should work", () => {
    expect(adminCredentials()).toEqual("admin-credentials");
  });
});
