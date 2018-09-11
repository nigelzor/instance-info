#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const util = require('util');

const regions = [
  { id: 'us-gov-west-1', label: 'AWS GovCloud (US)' },
  { id: 'ap-south-1', label: 'Asia Pacific (Mumbai)' },
  { id: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
  { id: 'ap-northeast-3', label: 'Asia Pacific (Osaka-Local)' },
  { id: 'ap-northeast-2', label: 'Asia Pacific (Seoul)' },
  { id: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
  { id: 'ap-southeast-2', label: 'Asia Pacific (Sydney)' },
  { id: 'ca-central-1', label: 'Canada (Central)' },
  { id: 'eu-central-1', label: 'EU (Frankfurt)' },
  { id: 'eu-west-1', label: 'EU (Ireland)' },
  { id: 'eu-west-2', label: 'EU (London)' },
  { id: 'eu-west-3', label: 'EU (Paris)' },
  { id: 'sa-east-1', label: 'South America (Sao Paulo)' },
  { id: 'us-east-1', label: 'US East (N. Virginia)' },
  { id: 'us-east-2', label: 'US East (Ohio)' },
  { id: 'us-west-1', label: 'US West (N. California)' },
  { id: 'us-west-2', label: 'US West (Oregon)' },
];

const offers = JSON.parse(fs.readFileSync(path.join(__dirname, './offers/v1.0/aws/AmazonEC2/current/index.json'), 'utf8'));
const products = Object.values(offers.products);
const instanceProducts = products.filter(p => p.productFamily === 'Compute Instance'
  && p.attributes.operation.startsWith('RunInstances') // filter out bad data
  && p.attributes.tenancy !== 'Host'); // you need to pay for the dedicated host separately, so this isn't helpful

function only(o) {
  if (o) {
    const v = Object.values(o);
    if (v.length !== 1) {
      throw new Error('expected ' + util.inspect(o) + ' to have one value');
    }
    return v[0];
  }
}

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
  const offer = offers.terms.Reserved[sku];
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

function isHourlyCost(priceDimension) {
  return priceDimension.beginRange === '0' && priceDimension.endRange === 'Inf' && priceDimension.unit === 'Hrs' && priceDimension.appliesTo.length === 0;
}

function isUpfrontCost(priceDimension) {
  return priceDimension.unit === 'Quantity' && priceDimension.description === 'Upfront Fee' && priceDimension.appliesTo.length === 0;
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

function priceName(p) {
  return [p.attributes.operatingSystem, p.attributes.preInstalledSw, p.attributes.licenseModel].filter(n => n !== 'No License required' && n !== 'NA').join(' - ');
}

const ec2 = {};
const ec2pricing = {};
const priceNames = new Set();
const reservationNames = new Set();

instanceProducts.forEach(p => {
  const { location, instanceType } = p.attributes;
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
  if (!ec2pricing[location]) {
    ec2pricing[location] = {};
  }
  if (!ec2pricing[location][instanceType]) {
    ec2pricing[location][instanceType] = [];
  }
  const pn = priceName(p);
  priceNames.add(pn);
  const reservedPrices = reservedPrice(p.sku);
  if (reservedPrices) {
    reservedPrices.forEach(rp => reservationNames.add(rp.name));
  }
  ec2pricing[location][instanceType].push({
    // Region: location,
    Name: pn,
    Tenancy: p.attributes.tenancy,
    OnDemand: onDemandPrice(p.sku),
    Reserved: reservedPrices,
  });
});

const regionFiles = new Map(regions.map((r) => [r.label, `ec2-${r.id}.json`]));

function write(file, json) {
  const content = JSON.stringify(json);
  console.log('writing', file, content.length, 'bytes');
  fs.writeFileSync(path.join(__dirname, 'data', file), content, 'utf8');
}

write('ec2.json', ec2);
Object.keys(ec2pricing).forEach(r => {
  write(regionFiles.get(r), ec2pricing[r]);
});
write('purchase-options.json', {
  names: [...priceNames],
  reservations: [...reservationNames],
});
