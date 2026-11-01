# Demo Booking

Two ways an SDR hands a prospect to an AE for a 30-minute demo. The SDR is on
the invite either way. Everything runs from one page: paste the prospect's email, pick the AE, then do one of the two below.

## 1. Prospect replied with a time → book it in one click

1. Click the time the prospect asked for. You see the AE's real open times, so no checking their calendar.
2. Click **Book**.

The event goes on the **AE's Google Calendar** with a Meet link (or the AE's
Zoom link), and Google emails a normal calendar invite to the AE, the
prospect and you. Your name, the AE and your timezone are remembered.

## 2. Prospect wants a link → send the AE's real Zoom link, get added automatically

Click **Copy Ethan's link** (or whichever AE you picked) and send it. It's the AE's own `scheduler.zoom.us` link, unchanged.

When the prospect books, Zoom Scheduler puts the meeting on the AE's Google
Calendar. The tool checks AE calendars every minute. When it finds a
booking from that prospect, or from someone else at their company, it
**adds you to the invite**. Google emails you the invite, and
**Links you've sent** shows "Booked" with the time.

It ignores bookings made before you copied the link, and it stops watching
after 14 days.

> Test this once with a real AE: book through their Zoom link with a test email
> and confirm the SDR gets added. If Zoom owns the calendar event (instead of
> the AE), Google won't let the tool add guests. The tool would then show
> "Booked, but couldn't add you", so you'd at least know it happened.

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
   timezone, demo hours, `schedulerLink` = their Zoom Scheduler link, optional
   `meetingLink` = their Zoom room for one-click bookings) and SDRs. `team.json` is
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
