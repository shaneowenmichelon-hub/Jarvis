import { describe, expect, it } from "vitest";

import { directionOf, parseAddress, parseAddressList, reachesOutside } from "@/lib/gmail";

const own = new Set(["shane@zmmevents.com"]);
const ownDomains = new Set(["zmmevents.com"]);

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

/**
 * The bug that mattered most in the first live run: forwarding an inbound lead
 * to a teammate carries Gmail's SENT label, so it read as "we replied" and
 * moved the brand to Awaiting Feedback while nobody had answered them.
 */
describe("reachesOutside", () => {
  it("is false for a forward that only went to teammates", () => {
    expect(reachesOutside(["zach@zmmevents.com"], own, ownDomains)).toBe(false);
  });

  it("is false when every recipient is on a domain we own", () => {
    expect(
      reachesOutside(["aj@zmmevents.com", "ronan@zmmevents.com"], own, ownDomains),
    ).toBe(false);
  });

  it("counts a subdomain of ours as ours", () => {
    expect(reachesOutside(["alerts@mail.zmmevents.com"], own, ownDomains)).toBe(false);
  });

  it("is true once a brand is on the thread, even alongside teammates", () => {
    expect(
      reachesOutside(["maya@flybyjing.com", "zach@zmmevents.com"], own, ownDomains),
    ).toBe(true);
  });

  it("is true when the brand is only on CC", () => {
    expect(reachesOutside(["zach@zmmevents.com", "cj@itsfratflix.com"], own, ownDomains)).toBe(
      true,
    );
  });

  it("is false for a message with no recipients at all", () => {
    expect(reachesOutside([], own, ownDomains)).toBe(false);
  });
});
