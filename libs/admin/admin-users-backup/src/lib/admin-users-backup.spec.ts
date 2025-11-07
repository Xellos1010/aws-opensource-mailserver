import { adminUsersBackup } from "./admin-users-backup";

describe("adminUsersBackup", () => {
  it("should work", () => {
    expect(adminUsersBackup()).toEqual("admin-users-backup");
  });
});
