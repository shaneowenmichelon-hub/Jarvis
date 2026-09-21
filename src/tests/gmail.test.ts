import { describe, expect, it } from "vitest";

import { directionOf, parseAddress, parseAddressList } from "@/lib/gmail";

const own = new Set(["shane@zmmevents.com"]);

describe("parseAddress", () => {
  it("splits a display name from the address", () => {
    expect(parseAddress("Maya Chen <maya@flybyjing.com>")).toEqual({
      name: "Maya Chen",
      email: "maya@flybyjing.com",
    });
  });

  it("strips quotes around a display name", () => {
    expect(parseAddress('"Chen, Maya" <maya@flybyjing.com>').name).toBe("Chen, Maya");
  });

  it("handles a bare address", () => {
    expect(parseAddress("maya@flybyjing.com")).toEqual({
      name: null,
      email: "maya@flybyjing.com",
    });
  });

  it("lowercases the address so grouping is stable", () => {
    expect(parseAddress("Maya <Maya@FlyByJing.com>").email).toBe("maya@flybyjing.com");
  });
});

describe("parseAddressList", () => {
  it("splits several recipients", () => {
    expect(parseAddressList("a@x.com, Bob <b@y.com>")).toEqual(["a@x.com", "b@y.com"]);
  });

  it("does not split on a comma inside a quoted name", () => {
    expect(parseAddressList('"Chen, Maya" <maya@x.com>, bob@y.com')).toEqual([
      "maya@x.com",
      "bob@y.com",
    ]);
  });

  it("returns nothing for an empty header", () => {
    expect(parseAddressList("")).toEqual([]);
  });
});

describe("directionOf", () => {
  it("trusts Gmail's SENT label", () => {
    // Sent from an alias we never listed — the label still gets it right.
    expect(directionOf(["SENT"], "shane@nightschool.co", own)).toBe("outbound");
  });

  it("falls back to matching our own addresses", () => {
    expect(directionOf(["INBOX"], "shane@zmmevents.com", own)).toBe("outbound");
  });

  it("treats everything else as inbound", () => {
    expect(directionOf(["INBOX"], "maya@flybyjing.com", own)).toBe("inbound");
  });

  it("is case-insensitive about our own addresses", () => {
    expect(directionOf(["INBOX"], "Shane@ZMMevents.com", own)).toBe("outbound");
  });
});
