import { adminReverseDns } from "./admin-reverse-dns";

describe("adminReverseDns", () => {
  it("should work", () => {
    expect(adminReverseDns()).toEqual("admin-reverse-dns");
  });
});
