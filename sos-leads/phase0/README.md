# Phase 0 — Prove the Mac can text a brand-new number

This is the ONLY thing we test before building anything else. If your Mac
can't reliably text a number it has never texted, nothing else matters yet.

There are no dependencies to install. Just Node (which you already have).

## Steps

1. Make sure **Messages** is open on your Mac and signed into your Apple ID,
   and that your iPhone has **Text Message Forwarding** turned on
   (iPhone: Settings → Messages → Text Message Forwarding → enable your Mac).

2. Open **Terminal**, go to this folder:

   ```bash
   cd sos-leads/phase0
   ```

3. Run it with a **test number you control** (ideally one you've NEVER texted
   from this Mac, since that's the real scenario). Use E.164 format
   (`+` then country code then number, no spaces):

   ```bash
   node send_test.js "+15551234567" "Phase 0 test from SOS tool"
   ```

4. The **first run** triggers a macOS pop-up: *"Terminal" wants to control
   "Messages."* Click **OK**. If you miss it, enable it under
   System Preferences → Security & Privacy → Privacy → **Automation**.

## What counts as success

The script printing "sent" is **not** proof. Check with your eyes:

- ✅ The text actually **arrives** on the test phone.
- ✅ The bubble in Messages is **blue (iMessage)** or **green (SMS)**.
- ❌ The bubble turns **red with a `!`** = failed. That's the case we have to
  solve before moving on.

Tell Claude exactly what you saw (which line it printed, and what the bubble
looked like). If it failed for a brand-new number, that's expected risk —
we'll try the fallback approaches (participant-of-service, then the `imsg`
CLI) and compare trade-offs before committing to one.
