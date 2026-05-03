import { adminDnsBackup } from "./admin-dns-backup";

describe("adminDnsBackup", () => {
  it("should work", () => {
    expect(adminDnsBackup()).toEqual("admin-dns-backup");
  });
});
