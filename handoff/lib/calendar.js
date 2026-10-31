// Calendar access. Two backends:
//  - google: a Google Workspace service account with domain-wide delegation.
//    It acts as the AE, so events land on the AE's own calendar and no AE
//    ever has to "connect" anything.
//  - mock:   fake busy blocks + in-memory events, for trying the app locally.
const crypto = require('crypto');
const { DateTime } = require('luxon');

function googleBackend(keyFile) {
  const { google } = require('googleapis');
  const scopes = ['https://www.googleapis.com/auth/calendar'];

  function clientFor(userEmail) {
    const auth = new google.auth.GoogleAuth({ keyFile, scopes, clientOptions: { subject: userEmail } });
    return google.calendar({ version: 'v3', auth });
  }

  return {
    name: 'google',
    async getBusy(email, timeMin, timeMax) {
      const cal = clientFor(email);
      const res = await cal.freebusy.query({
        requestBody: { timeMin, timeMax, items: [{ id: email }] },
      });
      const entry = res.data.calendars[email];
      if (entry.errors && entry.errors.length) {
        throw new Error(`Can't read calendar for ${email}: ${entry.errors[0].reason}`);
      }
      return entry.busy || [];
    },
    async createEvent({ organizerEmail, start, end, summary, description, attendees, location }) {
      const cal = clientFor(organizerEmail);
      const res = await cal.events.insert({
        calendarId: 'primary',
        sendUpdates: 'all', // emails the invite to SDR + prospect
        conferenceDataVersion: location ? 0 : 1,
        requestBody: {
          summary,
          description,
          location,
          start: { dateTime: start },
          end: { dateTime: end },
          attendees: attendees.map((a) => ({ email: a.email, displayName: a.name })),
          guestsCanModify: false,
          guestsCanSeeOtherGuests: true,
          ...(location
            ? {}
            : {
                conferenceData: {
                  createRequest: {
                    requestId: crypto.randomUUID(),
                    conferenceSolutionKey: { type: 'hangoutsMeet' },
                  },
                },
              }),
        },
      });
      return {
        id: res.data.id,
        htmlLink: res.data.htmlLink,
        meetLink: location || res.data.hangoutLink || null,
      };
    },
  };
}

function mockBackend() {
  const events = [];

  // Deterministic pseudo-random busy blocks per person per day.
  function rand(seed) {
    let h = crypto.createHash('sha256').update(seed).digest();
    let i = 0;
    return () => h[i++ % h.length] / 255;
  }

  return {
    name: 'mock',
    events,
    async getBusy(email, timeMin, timeMax) {
      const busy = [];
      let day = DateTime.fromISO(timeMin, { zone: 'America/New_York' }).startOf('day');
      const stop = DateTime.fromISO(timeMax);
      while (day < stop) {
        const r = rand(email + day.toISODate());
        const n = 2 + Math.floor(r() * 3);
        for (let k = 0; k < n; k++) {
          const start = day.set({ hour: 9 + Math.floor(r() * 8), minute: r() > 0.5 ? 30 : 0 });
          busy.push({ start: start.toUTC().toISO(), end: start.plus({ minutes: 30 + 30 * Math.floor(r() * 2) }).toUTC().toISO() });
        }
        day = day.plus({ days: 1 });
      }
      for (const ev of events) {
        if (ev.organizerEmail === email || ev.attendees.some((a) => a.email === email)) {
          busy.push({ start: ev.start, end: ev.end });
        }
      }
      return busy;
    },
    async createEvent(ev) {
      const id = 'mock_' + crypto.randomBytes(6).toString('hex');
      events.push({ id, ...ev });
      console.log(`[mock calendar] Created "${ev.summary}" ${ev.start} for ${ev.attendees.map((a) => a.email).join(', ')}`);
      return { id, htmlLink: null, meetLink: ev.location || 'https://meet.google.com/mock-link' };
    },
  };
}

function createCalendar() {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  if (keyFile) return googleBackend(keyFile);
  console.warn('GOOGLE_SERVICE_ACCOUNT_KEY_FILE not set — running with a MOCK calendar (no real invites are sent).');
  return mockBackend();
}

module.exports = { createCalendar };
