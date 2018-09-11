import html from 'nanohtml';
import regions from './regions';
import types from '../data/ec2.json';
import options from '../data/purchase-options.json';
import classnames from 'classnames';
import { instanceTypeCompare, reservationCompare } from "./sort";

const region = 'us-east-1';

const priceScales = {
  hour: 1,
  day: 24,
  month: 24 * 30,
  year: 24 * 365,
};

function round(n, places) {
  const x = Math.pow(10, places);
  return Math.round(n * x) / x;
}

const columnOptions = [
  { name: 'Name', value: (t) => t.instanceType },
  { name: 'Memory', value: (t) => t.info.memory, render: (t) => html`<td class="right">${t.info.memory}</td>` },
  { name: 'ECU', value: (t) => t.info.ecu },
  { name: 'vCPUs', value: (t) => t.info.vcpu },
  { name: 'ECU/vCPU', value: (t) => round(t.info.ecu / t.info.vcpu, 2) },
  { name: 'Physical Processor', value: (t) => t.info.physicalProcessor },
  { name: 'Clock Speed', value: (t) => t.info.clockSpeed },
  { name: 'Instance Storage', value: (t) => t.info.storage },
  { name: 'Network Performance', value: (t) => t.info.networkPerformance },
];

// BYOL is the same price as Linux, so doesn't add any information
const priceOptions = options.names.filter((n) => n !== 'Windows - Bring your own license').sort();

const reserveOptions = [
  { name: 'On Demand', value: (c) => c && c.OnDemand && c.OnDemand[1] },
  ...options.reservations.sort(reservationCompare).map((name) => (
    { name, value: (c) => {
      const rate = c && c.Reserved && c.Reserved.find((r) => r.name === name);
      return rate && rate.blended && rate.blended[1];
    } }
  )),
];

function parseStorage(s) {
  const match = /(\d+) x (\d+)/.exec(s);
  if (match) {
    return parseFloat(match[1]) * parseFloat(match[2]);
  }
  return parseFloat(s) || 0;
}

const state = window.state || (window.state = {
  region,
  types: Object.values(types).map((t) => Object.assign({}, t, {
    memory: parseFloat(t.info.memory.replace(/,/g, '')),
    vcpu: parseFloat(t.info.vcpu),
    storage: parseStorage(t.info.storage),
  })),
  highlight: new Set(),
  priceScale: 'hour',
  columns: columnOptions.filter((c, i) => i < 2 || i === 3 || i > 6),
  priceColumns: priceOptions.slice(0, 1),
  reserveColumns: reserveOptions.slice(0, 1),
  filter: {
    memory: 0,
    vcpu: 0,
    storage: 0,
    unavailable: true,
  }
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

function toggleColumn() {
  const label = this.parentNode.textContent;
  const names = new Set(state.columns.map((c) => c.name));
  names.delete(label) || names.add(label);
  state.columns = columnOptions.filter((c) => names.has(c.name));
  rerender();
}

function togglePriceColumn() {
  const label = this.parentNode.textContent;
  const names = new Set(state.priceColumns.map((c) => c));
  names.delete(label) || names.add(label);
  state.priceColumns = priceOptions.filter((c) => names.has(c));
  rerender();
}

function toggleReserveColumn() {
  const label = this.parentNode.textContent;
  const names = new Set(state.reserveColumns.map((c) => c.name));
  names.delete(label) || names.add(label);
  state.reserveColumns = reserveOptions.filter((c) => names.has(c.name));
  rerender();
}

function toggleFilterUnavailable() {
  state.filter.unavailable = !state.filter.unavailable;
  rerender();
}

function updateFilterMemory() {
  state.filter.memory = this.value;
  rerender();
}

function updateFilterVcpu() {
  state.filter.vcpu = this.value;
  rerender();
}

function updateFilterStorage() {
  state.filter.storage = this.value;
  rerender();
}

function renderColumns(state, t) {
  return state.columns.map((c) => c.render ? c.render(t) : html`<td>${c.value(t)}</td>`)
}

function renderPriceColumns(state, t, tc) {
  const scale = priceScales[state.priceScale] || 1;
  const formatCost = (c) => {
    if (c != null) {
      const d = round(c * scale, 4);
      return `$ ${d}`
    }
  };
  const cols = [];
  for (const pc of state.priceColumns) {
    const tpc = tc.find((c) => c.Name === pc);
    for (const rc of state.reserveColumns) {
      try {
        cols.push(html`<td>${formatCost(rc.value(tpc))}</td>`);
      } catch (e) {
        console.error(e);
      }
    }
  }
  return cols;
}

function renderPriceHeaders(state) {
  const cols = [];
  for (const pc of state.priceColumns) {
    for (const rc of state.reserveColumns) {
      cols.push(html`<th>${pc} ${rc.name}</th>`);
    }
  }
  return cols;
}

function renderPriceOptions(state) {
  return priceOptions.map((c) => html`<label><input type="checkbox" checked=${state.priceColumns.includes(c)} onchange=${togglePriceColumn} />${c}</label>`);
}

function renderReserveOption(state, r) {
  return html`<label><input type="checkbox" checked=${state.reserveColumns.find((rc) => rc.name === r.name) != null} onchange=${toggleReserveColumn} />${r.name}</label>`;
}

function render0(state) {
  const region = regions.find(r => r.id === state.region) || regions[0];
  return region.load().then(costs => {
    function makeRow(t) {
      const tc = (costs[t.instanceType] || []).filter(c => c.Tenancy === 'Shared');
      return html`
      <tr id=${t.instanceType} class=${classnames(state.highlight.has(t.instanceType) && 'highlight')} onclick=${toggleHighlight}>
        ${renderColumns(state, t)}
        ${renderPriceColumns(state, t, tc)}
      </tr>
      `;
    }

    function typeFilter(t) {
      if (state.filter.unavailable && !costs[t.instanceType]) {
        return false;
      }
      if (state.filter.memory != null && t.memory < state.filter.memory) {
        return false;
      }
      if (state.filter.vcpu != null && t.vcpu < state.filter.vcpu) {
        return false;
      }
      if (state.filter.storage != null && t.storage < state.filter.storage) {
        return false;
      }
      return true;
    }

    return html`
<div>
  <div class="settings">
    <label>Region:</label>
    <div> 
      <select onchange=${setRegion}>${regions.map(r => html`<option selected=${r.id === state.region} value=${r.id}>${r.label}</option>`)}</select>
    </div>
    <label>Columns:</label>
    <div>
      ${columnOptions.map((c) => html`<label><input type="checkbox" checked=${state.columns.find((sc) => sc.name === c.name) != null} onchange=${toggleColumn} />${c.name}</label>`)}
    </div>
    <label>Prices:</label> 
    <div>
      <div><label>per <select onchange=${setPriceScale}>${Object.keys(priceScales).map(r => html`<option selected=${r === state.priceScale} value=${r}>${r}</option>`)}</select></label></div>
      <div>${renderPriceOptions(state)}</div>
      <div>${reserveOptions.filter((ro) => ro.name === 'On Demand').map((ro) => renderReserveOption(state, ro))}</div>
      <div>${reserveOptions.filter((ro) => /standard/.test(ro.name)).map((ro) => renderReserveOption(state, ro))}</div>
      <div>${reserveOptions.filter((ro) => /convertible/.test(ro.name)).map((ro) => renderReserveOption(state, ro))}</div>
    </div>
    <label>Filter:</label>
    <div>
      <label>Memory: <input type="number" value=${state.filter.memory} onchange=${updateFilterMemory} /></label>
      <label>vCPUs: <input type="number" value=${state.filter.vcpu} onchange=${updateFilterVcpu} /></label>
      <label>Storage: <input type="number" value=${state.filter.storage} onchange=${updateFilterStorage} /></label>
      <label>Hide Unavailable: <input type="checkbox" checked=${state.filter.unavailable} onchange=${toggleFilterUnavailable} /></label>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        ${state.columns.map((c) => html`<th>${c.name}</th>`)}
        ${renderPriceHeaders(state)}
      </tr>
    </thead>
    <tbody>
      ${state.types.filter(typeFilter).map(makeRow)}
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