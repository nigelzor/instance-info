const fs = require('fs');

const types = {};
const priceNames = new Set();
const reservationNames = new Set();
const dates = new Set();

const inputs = process.argv.slice(2);

for (const f of inputs) {
  const i = JSON.parse(fs.readFileSync(f));
  Object.assign(types, i.types);
  for (const name of i.options.names) {
    priceNames.add(name);
  }
  for (const name of i.options.reservations) {
    reservationNames.add(name);
  }
  dates.add(i.date);
}

console.log(JSON.stringify({
  types,
  options: {
    names: [...priceNames],
    reservations: [...reservationNames],
  },
  dates: [...dates],
}));
