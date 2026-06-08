#!/usr/bin/env node
/*
 * PHASE 0 — The smallest possible "can my Mac text a brand-new number?" test.
 *
 * What this does, in plain language:
 *   It hands a short AppleScript to macOS, which tells your Messages app to
 *   send ONE text to ONE phone number. That's it. No database, no server,
 *   no dependencies — just Node calling the Messages app.
 *
 * Why it exists:
 *   The single riskiest part of this whole project is texting a number you
 *   have NEVER texted before (every new lead is a brand-new number). Before
 *   we build anything else, we prove this one thing works reliably.
 *
 * HOW TO RUN (on your Mac, in Terminal):
 *   1. cd into this folder:
 *        cd sos-leads/phase0
 *   2. Run it with a test number you control and a message:
 *        node send_test.js "+15551234567" "Phase 0 test from SOS tool"
 *
 *   The phone number MUST be in E.164 format: a + sign, country code, then
 *   the number, no spaces or dashes. US example: +15551234567
 *
 * WHAT TO EXPECT:
 *   - The FIRST time you run it, macOS will pop up a permission box asking
 *     if "Terminal" (or "node") is allowed to control "Messages". You must
 *     click OK / Allow. If you miss it, you'll see it again under:
 *       System Preferences -> Security & Privacy -> Privacy -> Automation
 *   - If it works, the text appears in your Messages app and arrives on the
 *     test phone. The script prints "RESULT: sent via iMessage" or
 *     "RESULT: sent via SMS".
 *
 * IMPORTANT — read this before trusting the result:
 *   AppleScript's "send" command is optimistic. It can print "sent" even
 *   when the message later turns into a failed (red !) bubble, because the
 *   number wasn't reachable. So for Phase 0, the REAL test is your eyes:
 *   does the text actually land on the test phone, and does the bubble in
 *   Messages stay blue/green (delivered) rather than turning red (failed)?
 *   In a later phase we'll verify this automatically by reading the Messages
 *   database. For now, you are the verifier.
 */

const { execFile } = require("node:child_process");

// --- read the two arguments the user typed ---
const phone = process.argv[2];
const message = process.argv[3];

if (!phone || !message) {
  console.error('Usage: node send_test.js "+15551234567" "your message"');
  process.exit(1);
}

// Gentle sanity check on the phone format. We don't block on it (you might be
// testing an international number), we just warn so a typo is obvious.
if (!/^\+\d{8,15}$/.test(phone)) {
  console.error(
    `WARNING: "${phone}" doesn't look like E.164 (e.g. +15551234567).`
  );
  console.error("Sending anyway, but double-check if it fails.\n");
}

/*
 * The AppleScript itself.
 *
 * Strategy (this is the "fallback ladder" from the plan):
 *   1) Try to send as iMessage (blue bubble). Works when the recipient has
 *      an iPhone/Apple device on that number.
 *   2) If that errors, fall back to SMS (green bubble) via Text Message
 *      Forwarding through your iPhone. This is what reaches Android / any
 *      non-iMessage number.
 *
 * We pass the phone and message in as arguments (run handler) so we never
 * have to worry about quoting or escaping inside the AppleScript text.
 */
const appleScript = `
on run {targetPhone, targetMessage}
  tell application "Messages"
    try
      set imsgService to 1st service whose service type = iMessage
      set theBuddy to buddy targetPhone of imsgService
      send targetMessage to theBuddy
      return "sent via iMessage"
    on error errMsgIMessage
      try
        set smsService to 1st service whose service type = SMS
        set theBuddy to buddy targetPhone of smsService
        send targetMessage to theBuddy
        return "sent via SMS"
      on error errMsgSMS
        return "FAILED -- iMessage error: " & errMsgIMessage & " | SMS error: " & errMsgSMS
      end try
    end try
  end tell
end run
`;

// execFile (not exec) so the phone/message are passed as separate arguments
// and never get interpreted by a shell. Safer and avoids quoting headaches.
execFile(
  "osascript",
  ["-e", appleScript, phone, message],
  (error, stdout, stderr) => {
    if (error) {
      console.error("ERROR running osascript:");
      console.error(stderr || error.message);
      console.error(
        "\nCommon causes:\n" +
          "  - Messages app isn't open / signed in\n" +
          "  - You denied the Automation permission prompt\n" +
          "  - osascript isn't allowed to control Messages (check Privacy settings)"
      );
      process.exit(1);
    }
    const result = (stdout || "").trim();
    console.log("RESULT:", result);
    console.log(
      "\nNow LOOK at your Messages app and the test phone:\n" +
        "  - Did the message arrive on the test phone?\n" +
        "  - Is the bubble blue or green (good) and NOT red with a ! (failed)?\n" +
        "Tell Claude what you saw."
    );
  }
);
