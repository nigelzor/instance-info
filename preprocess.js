const fs = require('fs');
const path = require('path');
const util = require('util');

const offers = JSON.parse(fs.readFileSync(path.join(__dirname, './offers/v1.0/aws/AmazonEC2/current/index.json'), 'utf-8'));
const products = Object.values(offers.products);
const instanceProducts = products.filter(p => p.productFamily === 'Compute Instance'
  && p.attributes.operation.startsWith('RunInstances') // filter out bad data
  && p.attributes.tenancy !== 'Host'); // you need to pay for the dedicated host separately, so this isn't helpful
const instanceTypes = new Set(instanceProducts.map(p => p.attributes.instanceType));
const regions = new Set(instanceProducts.map(p => p.attributes.location));

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
  return [p.attributes.operatingSystem, p.attributes.preInstalledSw, p.attributes.licenseModel].filter(n => n !== 'No License required').join(' - '); 
}

const ec2 = {};

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
    ec2[instanceType] = { instanceType, info, prices: [] };
  }
  ec2[instanceType].prices.push({
    Region: location,
    Name: priceName(p),
    Tenancy: p.attributes.tenancy,
    OnDemand: onDemandPrice(p.sku),
    Reserved: reservedPrice(p.sku),
  });
});

process.stdout.write(JSON.stringify(ec2));

// const out = Object.values(ec2).map(t => ([t.instanceType, t.prices.filter(p => p.Region === 'Canada (Central)' && p.Tenancy === 'Shared')]));
// console.log(util.inspect(out, true, 6, true));
