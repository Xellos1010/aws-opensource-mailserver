import { instanceProvision } from "./instance-provision";

describe("instanceProvision", () => {
  it("should work", () => {
    expect(instanceProvision()).toEqual("instance-provision");
  });
});
