import { sshAccess } from "./ssh-access";

describe("sshAccess", () => {
  it("should work", () => {
    expect(sshAccess()).toEqual("ssh-access");
  });
});
