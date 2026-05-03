import { adminEc2 } from "./admin-ec2";

describe("adminEc2", () => {
  it("should work", () => {
    expect(adminEc2()).toEqual("admin-ec2");
  });
});
