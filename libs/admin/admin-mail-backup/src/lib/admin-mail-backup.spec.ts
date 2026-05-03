import { adminMailBackup } from "./admin-mail-backup";

describe("adminMailBackup", () => {
  it("should work", () => {
    expect(adminMailBackup()).toEqual("admin-mail-backup");
  });
});
