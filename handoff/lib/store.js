// Tiny JSON-file store for handoffs. Fine for a pilot with one team;
// swap for Postgres/Firestore when rolling out wider.
const fs = require('fs');
const path = require('path');

class Store {
  constructor(file) {
    this.file = file;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { handoffs: {} };
  }
  get(token) {
    return this.data.handoffs[token] || null;
  }
  findPending({ sdrEmail, aeEmail, prospectEmail }) {
    return Object.values(this.data.handoffs).find(
      (h) => h.status === 'pending' && h.sdrEmail === sdrEmail && h.aeEmail === aeEmail && h.prospectEmail === prospectEmail
    );
  }
  save(handoff) {
    this.data.handoffs[handoff.token] = handoff;
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
    return handoff;
  }
}

module.exports = { Store };
