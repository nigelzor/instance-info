import html from 'nanohtml';
import regions from './regions';
import types from '../data/ec2.json';
import classnames from 'classnames';
import { instanceTypeCompare } from "./sort";

const region = 'us-east-1';

const priceScales = {
  hour: 1,
  day: 24,
  month: 24 * 30,
  year: 24 * 365,
};

const state = window.state || (window.state = {
  region,
  types: Object.values(types),
  highlight: new Set(),
  priceScale: 'hour',
});

state.types.sort((a, b) => instanceTypeCompare(a.instanceType, b.instanceType));

let pending = false;
function rerender() {
  if (!pending) {
    pending = true;
    setTimeout(() => {
      pending = false;
      render(state);
    });
  }
}

function toggleHighlight() {
  const id = this.id;
  state.highlight.delete(id) || state.highlight.add(id);
  rerender();
}

function setRegion() {
  state.region = this.value;
  rerender();
}

function setPriceScale() {
  state.priceScale = this.value;
  rerender();
}

function render0(state) {
  const region = regions.find(r => r.id === state.region) || regions[0];
  const scale = priceScales[state.priceScale] || 1;
  const onDemandCost = (c) => {
    if (c && c.OnDemand) {
      const d = Math.round(c.OnDemand[1] * scale * 10000) / 10000;
      return `$ ${d}`
    }
  };
  return region.load().then(costs => {
    function makeRow(t) {
      const cost = (costs[t.instanceType] || []).find(c => c.Tenancy === 'Shared' && c.Name === 'Linux');
      return html`
      <tr id=${t.instanceType} class=${classnames(state.highlight.has(t.instanceType) && 'highlight')} onclick=${toggleHighlight}>
        <td>${t.instanceType}</td>
        <td class="right">${t.info.memory}</td>
        <td>${t.info.ecu}</td>
        <td>${t.info.vcpu}</td>
        <td class="right">${t.info.storage}</td>
        <td>${t.info.networkPerformance}</td>
        <td>${onDemandCost(cost)}</td>
      </tr>
      `;
    }

    return html`
<div>
  <div>
    <label>Region: 
      <select onchange=${setRegion}>${regions.map(r => html`<option selected=${r.id === state.region} value=${r.id}>${r.label}</option>`)}</select>
    </label>
    <label>Prices: 
      <select onchange=${setPriceScale}>${Object.keys(priceScales).map(r => html`<option selected=${r === state.priceScale} value=${r}>${r}</option>`)}</select>
    </label>
  </div>
  <table>
    <thead>
      <tr>
        <th>Name</th>
        <th>Memory</th>
        <th>ECU</th>
        <th>vCPUs</th>
        <th>Instance Storage</th>
        <th>Network Performance</th>
        <th>Linux $/${state.priceScale}</th>
      </tr>
    </thead>
    <tbody>
      ${Object.values(state.types).map(makeRow)}
    </tbody>
  </table>
</div>
  `;
  });
}

let batch = 0;

function render(state) {
  const current = ++batch;
  Promise.resolve(render0(state)).then((el) => {
    if (current === batch) {
      replaceRoot(el);
    }
  });
}

function replaceRoot(el) {
  const root = document.getElementById('root');
  while (root.firstChild) {
    root.removeChild(root.firstChild);
  }
  root.appendChild(el);
}

render(state);
