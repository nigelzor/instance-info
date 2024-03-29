import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
import makeFetch from 'make-fetch-happen';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cachePath = path.join(__dirname, '../../../offers');

const fetch = makeFetch.defaults({ cachePath });

const HOST = 'https://pricing.us-east-1.amazonaws.com';

async function fetchOk(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Request failed: ' + index.statusText);
  }
  return response;
}

async function fetchRegions() {
  const regions = [];

  const index = await (await fetchOk(new URL('/offers/v1.0/aws/AmazonEC2/current/region_index.json', HOST))).json();

  const labelsHtml =
    await (await fetchOk('https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-regions-availability-zones.html'))
      .text();
  const labelsDom = new JSDOM(labelsHtml).window.document;
  const table = labelsDom.querySelector('table');
  const headings = table.querySelectorAll('thead th');
  assert.equal(headings.length, 3);
  const rows = table.querySelectorAll('tbody tr');
  for (const row of rows) {
    const cells = row.querySelectorAll('td');
    const regionCode = cells[0].textContent;
    const label = cells[1].textContent;
    regions.push({
      label,
      regionCode,
      // ...index.regions[regionCode],
    });
  }
  return regions;
}

const regions = await fetchRegions();
console.log(JSON.stringify(regions));
