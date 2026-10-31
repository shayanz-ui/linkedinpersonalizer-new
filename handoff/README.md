# Demo Handoff

Books SDR-to-AE demos so the **SDR is always on the invite**, whether the
prospect picks from suggested times or books through a link.

## What the SDR does

1. Paste the prospect's email (first name optional) and press Enter.
2. Paste the copied message into your email or LinkedIn thread. It has
   3 open times on the AE's calendar **and** a booking link.

That's it. Then either:

- **The prospect books through the link.** The invite goes out automatically to the
  AE, the SDR and the prospect (plus any teammates they add).
- **The prospect replies with a time.** Click **Book** next to it. Same invite.

Your name, AE and the prospect's timezone are remembered between handoffs.
Running it again for the same prospect + AE reuses the same link.

## How it works

- Availability comes from the AE's Google Calendar (free/busy only, so the
  prospect never sees meeting details). It's re-checked at booking time so
  nobody gets double-booked.
- The event is created **on the AE's calendar** (the AE is the organizer)
  with a Google Meet link, or the AE's Zoom link if one is set in `team.json`.
- Each link is single-use. Once booked, it shows the confirmed time.
- Optional Slack ping when a demo is booked.

## Run it locally (demo mode, no setup)

```bash
cd handoff
npm install
npm start
```

Open http://localhost:3100. Without Google credentials it uses a simulated
calendar, so you can click through everything without sending real invites.

## Going live

1. **Team roster.** Copy `team.example.json` to `team.json` and list your AEs
   (email, timezone, working hours, optional `meetingLink`) and SDRs.
   Settings cover the meeting length, how many days ahead to offer, minimum
   notice, buffers, and `requireSdrFree` (also check the SDR's calendar).
2. **Google access (needs IT / a Workspace admin).** Create a service account
   in Google Cloud, enable the Calendar API, and grant it **domain-wide
   delegation** for the scope `https://www.googleapis.com/auth/calendar`.
   Set `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` to its key. AEs don't have to connect
   anything themselves.
3. **Hosting.** Deploy anywhere that runs Node (Cloud Run, Render, an internal
   server). Set `BASE_URL` to the public URL. The `/b/...` booking pages must be
   public, but the SDR page should be internal: set `SDR_ACCESS_KEY` for a
   simple password, or ideally put it behind Google SSO.
4. **Storage.** Handoffs are saved to `data/handoffs.json`, which is fine for a
   pilot. Move to a real database before rolling out wider.

## Tests

```bash
npm test
```
