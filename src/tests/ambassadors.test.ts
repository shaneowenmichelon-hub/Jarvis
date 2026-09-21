import { describe, expect, it } from "vitest";

import {
  isAmbassadorApplication,
  parseAmbassadorApplication,
  totalFollowers,
} from "@/lib/ambassadors";
import type { ScannedMessage } from "@/lib/types";

const SENDERS = new Set(["no-reply@zmmevents.com"]);

function message(overrides: Partial<ScannedMessage> = {}): ScannedMessage {
  return {
    id: "m1",
    threadId: "t1",
    direction: "inbound",
    internal: false,
    fromEmail: "no-reply@zmmevents.com",
    fromName: null,
    toEmails: ["shane@zmmevents.com"],
    ccEmails: [],
    subject: "New ambassador application - Emillie Rosario, Kean University",
    snippet: null,
    sentAt: "2026-09-21T00:22:26Z",
    labelIds: ["INBOX"],
    headers: {},
    ...overrides,
  };
}

// Copied verbatim from a real notification, so a change to the form breaks
// this test rather than the board.
const REAL_BODY = `New ambassador application

Full Name: Emillie Rosario
Dob: 2006-03-21
Phone: 9734206151
City: Bloomfield
State: NJ
School: Kean University
School Email: rosaremi@kean.edu
Grad Year: 2028
Major: Marketing
Instagram: emillierosario
Tiktok: emillierosariooo
Ig Followers: 1305
Tt Followers: 1423
Niche: Fashion
Why: There are many different brands. I love such as garage, coach Kate Spade, but I wanna be a brand ambassador because I think it would be really good for me to get my foot in the door with marketing

Attribution / UTM:
Utm source: chatgpt.com
Landing page: /become-an-ambassador`;

describe("parseAmbassadorApplication", () => {
  it("reads every field off a real application", () => {
    const parsed = parseAmbassadorApplication(message({ body: REAL_BODY }));

    expect(parsed.fullName).toBe("Emillie Rosario");
    expect(parsed.school).toBe("Kean University");
    expect(parsed.schoolEmail).toBe("rosaremi@kean.edu");
    expect(parsed.gradYear).toBe("2028");
    expect(parsed.major).toBe("Marketing");
    expect(parsed.city).toBe("Bloomfield");
    expect(parsed.state).toBe("NJ");
    expect(parsed.phone).toBe("9734206151");
    expect(parsed.dob).toBe("2006-03-21");
    expect(parsed.niche).toBe("Fashion");
  });

  it("does not let School swallow the School Email", () => {
    const parsed = parseAmbassadorApplication(message({ body: REAL_BODY }));
    expect(parsed.school).toBe("Kean University");
    expect(parsed.school).not.toContain("@");
  });

  it("reads handles and follower counts as numbers", () => {
    const parsed = parseAmbassadorApplication(message({ body: REAL_BODY }));

    expect(parsed.instagram).toBe("emillierosario");
    expect(parsed.tiktok).toBe("emillierosariooo");
    expect(parsed.igFollowers).toBe(1305);
    expect(parsed.ttFollowers).toBe(1423);
  });

  it("strips a leading @ from handles", () => {
    const parsed = parseAmbassadorApplication(
      message({ body: "Full Name: A B\nInstagram: @someone\nNiche: Fashion" }),
    );
    expect(parsed.instagram).toBe("someone");
  });

  it("keeps the applicant's own words", () => {
    const parsed = parseAmbassadorApplication(message({ body: REAL_BODY }));
    expect(parsed.why).toMatch(/^There are many different brands/);
    expect(parsed.why).toMatch(/foot in the door with marketing$/);
  });

  it("keeps the attribution, so you can see which campaigns recruit", () => {
    const parsed = parseAmbassadorApplication(message({ body: REAL_BODY }));
    expect(parsed.utmSource).toBe("chatgpt.com");
    expect(parsed.landingPage).toBe("/become-an-ambassador");
  });

  it("falls back to the snippet when the body was not fetched", () => {
    // Gmail's snippet loses the colons and the line breaks.
    const parsed = parseAmbassadorApplication(
      message({
        body: undefined,
        snippet:
          "New ambassador application Submission Full Name Emillie Rosario Dob 2006-03-21 " +
          "Phone 9734206151 City Bloomfield State NJ School Kean University",
      }),
    );

    expect(parsed.fullName).toBe("Emillie Rosario");
    expect(parsed.school).toBe("Kean University");
    expect(parsed.state).toBe("NJ");
  });

  it("falls back to the subject when the body is unusable", () => {
    const parsed = parseAmbassadorApplication(message({ body: "", snippet: null }));

    expect(parsed.fullName).toBe("Emillie Rosario");
    expect(parsed.school).toBe("Kean University");
  });

  it("returns nulls rather than throwing on a missing field", () => {
    const parsed = parseAmbassadorApplication(
      message({ subject: "New ambassador application", body: "Full Name: Solo Applicant" }),
    );

    expect(parsed.fullName).toBe("Solo Applicant");
    expect(parsed.igFollowers).toBeNull();
    expect(parsed.schoolEmail).toBeNull();
  });
});

describe("isAmbassadorApplication", () => {
  it("recognises an application", () => {
    expect(isAmbassadorApplication(message(), SENDERS, "ambassador application")).toBe(true);
  });

  it("does not mistake a brand inquiry for one", () => {
    expect(
      isAmbassadorApplication(
        message({ subject: "New brand inquiry - FlatFlow" }),
        SENDERS,
        "ambassador application",
      ),
    ).toBe(false);
  });

  it("ignores the same subject from anyone else", () => {
    expect(
      isAmbassadorApplication(
        message({ fromEmail: "someone@elsewhere.com" }),
        SENDERS,
        "ambassador application",
      ),
    ).toBe(false);
  });
});

/**
 * Three more real notifications, each an awkward shape the first fixture does
 * not cover: a "Secure files" block wedged between `Why` and the attribution
 * footer, a `Referrer` line sitting inside the attribution block, a follower
 * count written with a thousands separator, and applicants who simply left
 * fields blank. All four of these got past the parser until the seed was built
 * from the real inbox.
 */
const WITH_SECURE_FILES = `New ambassador application

Full Name: Cadence Kogel
Dob: 2007-02-22
Phone: 6053506107
City: New Orleans
State: LA
School: Tulane University
School Email: Ckogel@tulane.edu
Grad Year: 2029
Major: Neuroscience and Public Health
Instagram: ck__2025
Tiktok: cades_spam.acct
Ig Followers: 848
Tt Followers: 215
Niche: Fashion
Why: I want to join because as a college student I believe that I can be a good role model in being your most authentic self.

Secure files:
Government ID - front: not uploaded - storage not configured
Government ID - back: not uploaded - storage not configured

Attribution / UTM:
Utm source: chatgpt.com
Referrer: https://chatgpt.com/
Landing page: /become-an-ambassador`;

const NO_INSTAGRAM = `New ambassador application

Full Name: Jordan Poncher
Dob: 2007-11-27
Phone: 13034726390
City: Elon
State: NC
School: Elon University
School Email: jponcher@elon.edu
Grad Year: 2030
Major: Strategic Communications
Tiktok: journeywithjor
Tt Followers: 101
Niche: Lifestyle

Attribution / UTM:
Utm source: chatgpt.com
Referrer: https://chatgpt.com/
Landing page: /become-an-ambassador`;

const COMMA_FOLLOWERS = `New ambassador application

Full Name: Anika Patel
School: Indiana University Bloomington
School Email: pateanik@iu.edu
Instagram: @anikapatel.7
Tiktok: @anikapatel10487
Ig Followers: 3,532
Tt Followers: 1913
Niche: Fashion

Attribution / UTM:
Utm source: chatgpt.com
Referrer: https://chatgpt.com/
Landing page: /become-an-ambassador`;

describe("parseAmbassadorApplication, awkward real shapes", () => {
  it("stops 'Why' at the secure-files block instead of swallowing it", () => {
    const parsed = parseAmbassadorApplication(
      message({
        subject: "New ambassador application - Cadence Kogel, Tulane University",
        body: WITH_SECURE_FILES,
      }),
    );

    expect(parsed.why).toBe(
      "I want to join because as a college student I believe that I can be a good role model in being your most authentic self.",
    );
    expect(parsed.why).not.toMatch(/Secure files|Government ID|storage not configured/i);
    expect(parsed.niche).toBe("Fashion");
  });

  it("stops 'Utm source' at the referrer line", () => {
    const parsed = parseAmbassadorApplication(
      message({
        subject: "New ambassador application - Cadence Kogel, Tulane University",
        body: WITH_SECURE_FILES,
      }),
    );

    expect(parsed.utmSource).toBe("chatgpt.com");
    expect(parsed.landingPage).toBe("/become-an-ambassador");
  });

  it("leaves a platform null when the applicant did not give one", () => {
    const parsed = parseAmbassadorApplication(
      message({
        subject: "New ambassador application - Jordan Poncher, Elon University",
        body: NO_INSTAGRAM,
      }),
    );

    expect(parsed.instagram).toBeNull();
    expect(parsed.igFollowers).toBeNull();
    expect(parsed.tiktok).toBe("journeywithjor");
    expect(parsed.ttFollowers).toBe(101);
    expect(parsed.major).toBe("Strategic Communications");
  });

  it("reads a follower count written with a thousands separator", () => {
    const parsed = parseAmbassadorApplication(
      message({
        subject: "New ambassador application - Anika Patel, Indiana University Bloomington",
        body: COMMA_FOLLOWERS,
      }),
    );

    expect(parsed.igFollowers).toBe(3532);
    expect(parsed.ttFollowers).toBe(1913);
    expect(totalFollowers({ ig_followers: parsed.igFollowers, tt_followers: parsed.ttFollowers })).toBe(
      5445,
    );
  });

  it("matches the em-dash subject the form used at launch", () => {
    expect(
      isAmbassadorApplication(
        message({ subject: "New ambassador application — Zach Maitlin, Tulane" }),
        SENDERS,
        "ambassador application",
      ),
    ).toBe(true);
  });
});
