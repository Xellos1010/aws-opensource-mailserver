import { sesDns } from "./ses-dns";

describe("sesDns", () => {
  it("should work", () => {
    expect(sesDns()).toEqual("ses-dns");
  });
});
