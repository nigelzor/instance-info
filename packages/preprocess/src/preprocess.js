#!/usr/bin/env node
import fs from 'fs';
import util from 'util';

function only(o) {
  if (o) {
    const v = Object.values(o);
    if (v.length !== 1) {
      throw new Error('expected ' + util.inspect(o) + ' to have one value');
    }
    return v[0];
  }
}

function nullOrEmpty(a) {
  return a == null || a.length === 0;
}

function isHourlyCost(priceDimension) {
  return priceDimension.beginRange === '0' && priceDimension.endRange === 'Inf'
    && (priceDimension.unit === 'Hours' || priceDimension.unit === 'Hrs') && nullOrEmpty(priceDimension.appliesTo);
}

function isUpfrontCost(priceDimension) {
  return priceDimension.unit === 'Quantity' && priceDimension.description === 'Upfront Fee'
    && nullOrEmpty(priceDimension.appliesTo);
}

function toCost(priceDimension) {
  const [unit, amount] = only(Object.entries(priceDimension.pricePerUnit));
  return [unit, parseFloat(amount)];
}

function addCost(a, b) {
  if (a[0] !== b[0]) {
    throw new Error('cannot add ' + util.inspect(a) + ' and ' + util.inspect(b));
  }
  return [a[0], a[1] + b[1]];
}

function justDollars(a) {
  if (a) {
    if (a[0] !== 'USD') {
      throw new Error('expected ' + util.inspect(a) + ' to be in USD');
    }
    return a[1];
  }
}

function priceName(p) {
  return [p.attributes.operatingSystem, p.attributes.preInstalledSw, p.attributes.licenseModel].filter(n =>
    n !== 'No License required' && n !== 'NA'
  ).join(' - ');
}

function loadProducts(input) {
  const offers = JSON.parse(fs.readFileSync(input, 'utf8'));
  const products = Object.values(offers.products).filter(p =>
    p.productFamily === 'Compute Instance'
    && p.attributes.operation.startsWith('RunInstances') // filter out bad data
    && p.attributes.tenancy === 'Shared' // 'Dedicated', 'Host' aren't useful
    && p.attributes.capacitystatus === 'Used' // ignore Capacity Reservations
  );

  function onDemandPrice(sku) {
    const offer = offers.terms.OnDemand[sku];
    if (offer) {
      const perHr = only(only(offer).priceDimensions);
      if (!isHourlyCost(perHr)) {
        throw new Error('expected ' + util.inspect(only(offer)) + ' to be hourly cost');
      }
      return toCost(perHr);
    }
  }

  function reservedPrice(sku) {
    const offer = offers.terms.Reserved && offers.terms.Reserved[sku];
    return offer && Object.values(offer).map(o => {
      const dimensions = Object.values(o.priceDimensions);
      const hourly = dimensions.filter(isHourlyCost).map(toCost);
      const upfront = dimensions.filter(isUpfrontCost).map(toCost);
      if (hourly.length > 1 || upfront.length > 1 || dimensions.length !== (hourly.length + upfront.length)) {
        throw new Error('unexpected costs in offer ' + util.inspect(o));
      }
      const name = Object.values(o.termAttributes).join(' - ');
      const hours = /^(\d+)yr$/.exec(o.termAttributes.LeaseContractLength)[1] * 365.25 * 24;
      const blended = hourly.concat(upfront.map(([unit, amount]) => [unit, amount / hours])).reduce(addCost);
      return { name, upfront: upfront[0], hourly: hourly[0], blended };
    });
  }

  return { products, onDemandPrice, reservedPrice, publicationDate: offers.publicationDate };
}

const ec2 = {};
const ec2pricing = {};
const priceNames = new Set();
const reservationNames = new Set();
let regionName;

const { products, onDemandPrice, reservedPrice, publicationDate } = loadProducts(process.argv[2]);

products.forEach(p => {
  const { location, instanceType } = p.attributes;
  regionName = location;
  if (!ec2[instanceType]) {
    const info = { ...p.attributes };
    delete info.servicecode;
    delete info.servicename;
    delete info.location;
    delete info.locationType;
    delete info.capacitystatus;
    delete info.operatingSystem;
    delete info.preInstalledSw;
    delete info.licenseModel;
    delete info.usagetype;
    delete info.operation;
    ec2[instanceType] = { instanceType, info };
  }
  if (!ec2pricing[instanceType]) {
    ec2pricing[instanceType] = [];
  }
  const pn = priceName(p);
  priceNames.add(pn);
  const reservedPrices = reservedPrice(p.sku);
  if (reservedPrices) {
    reservedPrices.forEach(rp => reservationNames.add(rp.name));
  }
  ec2pricing[instanceType].push({
    Name: pn,
    OnDemand: justDollars(onDemandPrice(p.sku)),
    Reserved: reservedPrices && reservedPrices.map((rp) => ({
      name: rp.name,
      upfront: justDollars(rp.upfront),
      hourly: justDollars(rp.hourly),
      blended: justDollars(rp.blended),
    })),
  });
});

console.log(JSON.stringify({
  name: regionName,
  date: publicationDate,
  types: ec2,
  options: {
    names: [...priceNames],
    reservations: [...reservationNames],
  },
  prices: ec2pricing,
}));
