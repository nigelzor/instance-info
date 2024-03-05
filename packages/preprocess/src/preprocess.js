#!/usr/bin/env node
import fs from 'fs';
import ndjson from 'ndjson';
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

function scaleCost(a, scale) {
  return [a[0], a[1] * scale];
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

async function loadProducts(input) {
  const products = [];
  const lines = fs.createReadStream(input, 'utf8')
    .pipe(ndjson.parse());

  for await (const { product, terms, publicationDate } of lines) {
    products.push({
      product,
      onDemandPrice: onDemandPrice(terms),
      reservedPrices: reservedPrices(terms),
      publicationDate,
    });
  }

  function onDemandPrice(terms) {
    const offer = only(terms.OnDemand);
    if (offer) {
      const perHr = only(offer.priceDimensions);
      if (!isHourlyCost(perHr)) {
        throw new Error('expected ' + util.inspect(offer) + ' to be hourly cost');
      }
      return toCost(perHr);
    }
  }

  function reservedPrices(terms) {
    return terms.Reserved && Object.values(terms.Reserved).map(o => {
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

  return products;
}

const ec2 = {};
const ec2pricing = {};
const priceNames = new Set();
const reservationNames = new Set();
let regionName, publicationDate;

const ec2PriceInput = process.argv[2];
const products = await loadProducts(ec2PriceInput);

products.forEach(({ product: p, onDemandPrice, reservedPrices, publicationDate: pd }) => {
  const { location, instanceType } = p.attributes;
  regionName = location;
  publicationDate = pd;

  if (!ec2[instanceType]) {
    const info = {
      memory: p.attributes.memory,
      ecu: p.attributes.ecu,
      vcpu: p.attributes.vcpu,
      physicalProcessor: p.attributes.physicalProcessor,
      clockSpeed: p.attributes.clockSpeed,
      storage: p.attributes.storage,
      networkPerformance: p.attributes.networkPerformance,
    };
    ec2[instanceType] = { instanceType, info };
  }
  if (!ec2pricing[instanceType]) {
    ec2pricing[instanceType] = [];
  }
  const pn = priceName(p);
  priceNames.add(pn);
  if (reservedPrices) {
    reservedPrices.forEach(rp => reservationNames.add(rp.name));
  }
  ec2pricing[instanceType].push({
    Name: pn,
    OnDemand: justDollars(onDemandPrice),
    Reserved: reservedPrices && reservedPrices.map((rp) => ({
      name: rp.name,
      upfront: justDollars(rp.upfront),
      hourly: justDollars(rp.hourly),
      blended: justDollars(rp.blended),
    })),
  });
});

const ecsPriceInput = process.argv[3];
const addFargate = await (async (input) => {
  const lines = fs.createReadStream(input, 'utf8')
    .pipe(ndjson.parse());

  const productsByArch = new Map();

  for await (const line of lines) {
    const { product } = line;
    if (product.attributes.tenancy !== 'Shared') continue;
    if (product.attributes.operatingSystem === 'Windows') continue;

    const arch = product.attributes.cpuArchitecture;
    if (!productsByArch.has(arch)) {
      productsByArch.set(arch, []);
    }
    productsByArch.get(arch).push(line);
  }

  for (const [arch, products] of productsByArch.entries()) {
    const perCPU = products.find((p) => p.product.attributes.cputype === 'perCPU');
    const perGB = products.find((p) => p.product.attributes.memorytype === 'perGB');
    if (products.length !== 2 || !perCPU || !perGB) {
      throw new Error(`expected 2 ECS products for architecture ${arch}`);
    }
    productsByArch.set(arch, { perCPU, perGB });
  }

  function onDemandPrice(terms) {
    const offer = only(terms.OnDemand);
    const perHr = only(offer.priceDimensions);
    return toCost(perHr);
  }

  return (cpu, memory) => {
    for (const [arch, { perCPU, perGB }] of productsByArch.entries()) {
      const suffix = arch ? ` ${arch}` : '';
      const name = `Fargate ${cpu}/${memory}${suffix}`;
      ec2[name] = {
        instanceType: name,
        info: {
          memory: `${memory / 1024} GB`,
          ecu: 'NA',
          vcpu: `${cpu / 1024}`,
          physicalProcessor: arch || '',
          clockSpeed: '',
          storage: 'Ephemeral',
          networkPerformance: '',
        },
      };
      const cpuCost = scaleCost(onDemandPrice(perCPU.terms), cpu / 1024);
      const memoryCost = scaleCost(onDemandPrice(perGB.terms), memory / 1024);
      ec2pricing[name] = [{
        Name: 'Linux',
        OnDemand: justDollars(addCost(cpuCost, memoryCost)),
      }];
    }
  };
})(ecsPriceInput);

// https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-tasks-services.html#fargate-tasks-size
[0.5, 1, 2].forEach((memory) => addFargate(256, memory * 1024));
range(1, 4, 1).forEach((memory) => addFargate(512, memory * 1024));
range(2, 8, 1).forEach((memory) => addFargate(1024, memory * 1024));
range(4, 16, 1).forEach((memory) => addFargate(2048, memory * 1024));
range(8, 30, 1).forEach((memory) => addFargate(4096, memory * 1024));
range(16, 60, 4).forEach((memory) => addFargate(8192, memory * 1024));
range(32, 120, 8).forEach((memory) => addFargate(16384, memory * 1024));

function range(start, stop, step) {
  const r = [];
  for (let v = start; v <= stop; v += step) {
    r.push(v);
  }
  return r;
}

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
