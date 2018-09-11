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

const priceOptions = ['Linux', 'Windows'];

const reserveOptions = [
  { name: 'On Demand', value: (c) => c && c.OnDemand && c.OnDemand[1] },
];

['standard', 'convertible'].forEach((type) => {
  ['1yr', '3yr'].forEach((length) => {
    ['No Upfront', 'Partial Upfront', 'All Upfront'].forEach((upfront) => {
      const name = `${length} - ${type} - ${upfront}`;
      reserveOptions.push({ name, value: (c) => {
          const rate = c && c.Reserved && c.Reserved.find((r) => r.name === name);
          return rate && rate.blended && rate.blended[1];
      } })
    });
  });
});

const state = window.state || (window.state = {
  region,
  types: Object.values(types),
  highlight: new Set(),
  priceScale: 'hour',
  columns: columnOptions.filter((c, i) => i < 2 || i === 3 || i > 6),
  priceColumns: priceOptions.slice(0, 1),
  reserveColumns: reserveOptions.slice(0, 1),
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

    return html`
<div>
  <div class="settings">
    <div>
      <label>Region:</label>
      <div> 
        <select onchange=${setRegion}>${regions.map(r => html`<option selected=${r.id === state.region} value=${r.id}>${r.label}</option>`)}</select>
      </div>
    </div>
    <div>
      <label>Columns:</label>
      <div>
        ${columnOptions.map((c) => html`<label><input type="checkbox" checked=${state.columns.find((sc) => sc.name === c.name) != null} onchange=${toggleColumn} />${c.name}</label>`)}
      </div>
    </div>
    <div>
      <label>Prices:</label> 
      <div>
        <div>${priceOptions.map((c) => html`<label><input type="checkbox" checked=${state.priceColumns.includes(c)} onchange=${togglePriceColumn} />${c}</label>`)}</div>
        <div>${reserveOptions.map((r) => html`<label><input type="checkbox" checked=${state.reserveColumns.find((rc) => rc.name === r.name) != null} onchange=${toggleReserveColumn} />${r.name}</label>`)}</div>
        <div><label>per <select onchange=${setPriceScale}>${Object.keys(priceScales).map(r => html`<option selected=${r === state.priceScale} value=${r}>${r}</option>`)}</select></label></div>
      </div>
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
      ${state.types.map(makeRow)}
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
