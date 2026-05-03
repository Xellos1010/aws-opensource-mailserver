import { adminDnsApi } from "./admin-dns-api";

describe("adminDnsApi", () => {
  it("should work", () => {
    expect(adminDnsApi()).toEqual("admin-dns-api");
  });
});
