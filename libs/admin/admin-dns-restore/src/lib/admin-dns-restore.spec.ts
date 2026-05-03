import { adminDnsRestore } from "./admin-dns-restore";

describe("adminDnsRestore", () => {
  it("should work", () => {
    expect(adminDnsRestore()).toEqual("admin-dns-restore");
  });
});
