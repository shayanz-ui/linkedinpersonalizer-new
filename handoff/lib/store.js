// Tiny JSON-file store for "links sent" (watches). Fine for a pilot;
// swap for a real database when rolling out wider.
const fs = require('fs');
const path = require('path');

class Store {
  constructor(file) {
    this.file = file;
    if (!file) {
      this.data = { watches: [] };
      return;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { watches: [] };
  }
  watches() {
    return this.data.watches;
  }
  add(watch) {
    this.data.watches.push(watch);
    this.save();
    return watch;
  }
  save() {
    if (!this.file) return;
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }
}

module.exports = { Store };
