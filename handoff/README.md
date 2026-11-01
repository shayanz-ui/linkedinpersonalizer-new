# Demo Booking

Two ways an SDR hands a prospect to an AE for a 30-minute demo. The SDR is on
the invite either way.

## 1. Prospect replied with a time → book it in one click (this tool)

1. Paste the prospect's email and pick the AE.
2. Click the time the prospect asked for. You see the AE's real open times, so no checking their calendar.
3. Click **Book**.

The event goes on the **AE's Google Calendar** with a Meet link (or the AE's
Zoom link), and Google emails a normal calendar invite to the AE, the
prospect and you. Your name, the AE and your timezone are remembered.

## 2. Prospect wants a link → a Google Calendar booking page (no code)

Google Calendar's **appointment schedules** support co-hosts. Every booking
lands on each co-host's calendar too. The prospect gets a real
`calendar.google.com` link, and the SDR is on every booking.

Set it up once per SDR + AE pair:

1. In Google Calendar, click **Create → Appointment schedule**.
2. Name it something like "Mercury demo with Alex". Set the duration to 30 min and the hours to the AE's demo hours.
3. Under **Co-hosts**, add the other person: the AE if you (the SDR) own the
   schedule, or the SDR if the AE owns it.
4. Under **Check calendars for availability**, make sure the **AE's**
   calendar is checked, so it only offers times the AE is free.
5. Optionally turn on **Guests can invite others** so the prospect can add a cofounder.
6. Save, then **Share → copy the link**. Paste that link whenever a prospect asks for one.

Test it once by booking yourself with a personal email. Make sure the
invite shows the AE, the SDR and the booker.

## Run it locally (demo mode, no setup)

```bash
cd handoff
npm install
npm start
```

Open http://localhost:3100. Without Google credentials it uses a simulated
calendar, so nothing is sent.

## Going live

1. **Team.** Copy `team.example.json` to `team.json` and fill in the real AEs (email,
   timezone, demo hours, optional `meetingLink`) and SDRs. `team.json` is
   never committed.
2. **Google access (IT / Workspace admin).** Create a service account with the
   Calendar API enabled and **domain-wide delegation** for
   `https://www.googleapis.com/auth/calendar`. Set
   `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` to its key. AEs don't need to connect anything.
3. **Hosting.** Run it on any internal host. It's for SDRs only, so keep it
   behind Google sign-in, or at least set `SDR_ACCESS_KEY` for a shared password.

## Tests

```bash
npm test
```
