import html from 'nanohtml';
import morph from 'nanomorph';
import { regions } from './regions';
import optionData from '../data/options.json';
import classnames from 'classnames';
import memoize from 'memoize-one';
import { instanceTypeCompare, reservationCompare } from "./sort";

const region = 'us-east-1';
const { types, options } = optionData;

const priceScales = {
  hour: 1,
  day: 24,
  month: 24 * 30.42,
  year: 24 * 365.25,
};

function round(n, places) {
  const x = Math.pow(10, places);
  return Math.round(n * x) / x;
}

function sortBy(name) {
  return (a, b) => {
    if (a === b) return 0;
    if (a[name] > b[name] || (Number.isNaN(a[name]) && !Number.isNaN(b[name]))) return 1;
    if (a[name] < b[name] || (!Number.isNaN(a[name]) && Number.isNaN(b[name]))) return -1;
    return 0;
  }
}

const columnOptions = [
  { name: 'Name', value: (t) => t.instanceType, sort: (a, b) => instanceTypeCompare(a.instanceType, b.instanceType) },
  { name: 'Memory', value: (t) => t.info.memory, render: (t) => html`<td class="right">${t.info.memory}</td>`, sort: sortBy('memory') },
  { name: 'ECU', value: (t) => t.info.ecu, sort: sortBy('ecu') },
  { name: 'vCPUs', value: (t) => t.info.vcpu, sort: sortBy('vcpu') },
  { name: 'ECU/vCPU', value: (t) => round(t.info.ecu / t.info.vcpu, 2) },
  { name: 'Physical Processor', value: (t) => t.info.physicalProcessor },
  { name: 'Clock Speed', value: (t) => t.info.clockSpeed },
  { name: 'Instance Storage', value: (t) => t.info.storage, sort: sortBy('storage') },
  { name: 'Network Performance', value: (t) => t.info.networkPerformance },
];

// BYOL is the same price as Linux, so doesn't add any information
const priceOptions = options.names.filter((n) => n !== 'Windows - Bring your own license').sort();

const reserveOptions = [
  { name: 'On Demand', value: (c) => c && c.OnDemand && c.OnDemand },
  ...options.reservations.sort(reservationCompare).map((name) => (
    { name, value: (c) => {
      const rate = c && c.Reserved && c.Reserved.find((r) => r.name === name);
      return rate && rate.blended;
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
    ecu: parseFloat(t.info.ecu),
    vcpu: parseFloat(t.info.vcpu),
    storage: parseStorage(t.info.storage.replace(/,/g, '')),
  })),
  highlight: new Set(),
  priceScale: 'hour',
  columns: columnOptions.filter((c, i) => i < 2 || i === 3 || i > 6),
  priceColumns: priceOptions.slice(0, 1),
  reserveColumns: reserveOptions.slice(0, 1),
  filter: {
    name: '',
    memory: 0,
    vcpu: 0,
    storage: 0,
    unavailable: true,
  },
  sort: [columnOptions[0], true, columnOptions[0].sort],
});

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

function updateFilterName() {
  state.filter.name = this.value;
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

function renderPriceColumns(state, t, costs) {
  const tc = costs[t.instanceType] || [];
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

function reverse(compare) {
  return (a, b) => compare(b, a);
}

function renderColumnHeaders(state) {
  return state.columns.map((c) => {
    if (!c.sort) {
      return html`<th>${c.name}</th>`;
    }
    const active = state.sort[0] === c;
    const direction = active && state.sort[1];
    const sort = () => {
      state.sort = [c, !direction, direction ? reverse(c.sort) : c.sort];
      rerender();
    };
    return html`<th onclick=${sort} class=${classnames('sortable', active && `sort-${direction}`)}>${c.name}</th>`;
  })
}

const priceCompare = (pc, rc, direction) => (costs) => (a, b) => {
  const tca = costs[a.instanceType];
  const tcb = costs[b.instanceType];
  const tpca = tca && tca.find((c) => c.Name === pc);
  const tpcb = tcb && tcb.find((c) => c.Name === pc);
  const av = rc.value(tpca);
  const bv = rc.value(tpcb);

  // we always want NaN at the end, regardless of direction
  if (isFinite(av - bv)) {
    return direction ? bv - av : av - bv;
  }
  return isFinite(av) ? -1 : 1;
};

function renderPriceHeaders(state) {
  const cols = [];
  for (const pc of state.priceColumns) {
    for (const rc of state.reserveColumns) {
      const name = `${pc} ${rc.name}`;
      const active = state.sort[0] === name;
      const direction = active && state.sort[1];
      const sort = () => {
        state.sort = [name, !direction, null, priceCompare(pc, rc, direction)];
        rerender();
      };
      cols.push(html`<th onclick=${sort} class=${classnames('sortable', active && `sort-${direction}`)}>${name}</th>`);
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

const loadRegion = memoize((region) => {
  const filename = `data/ec2-${region.id}.json`;
  return fetch(filename).then((res) => res.json());
});

const sortTypes = memoize((types, sort, costs) => {
  const sorter = sort[3] ? sort[3](costs) : sort[2];
  return types.sort(sorter);
});

function render0(state) {
  const region = regions.find(r => r.id === state.region) || regions[0];
  return loadRegion(region).then(({ prices: costs, date }) => {
    function makeRow(t) {
      return html`
      <tr id=${t.instanceType} class=${classnames(state.highlight.has(t.instanceType) && 'highlight')} onclick=${toggleHighlight}>
        ${renderColumns(state, t)}
        ${renderPriceColumns(state, t, costs)}
      </tr>
      `;
    }

    function typeFilter(t) {
      if (state.filter.unavailable && !costs[t.instanceType]) {
        return false;
      }
      if (state.filter.name && !t.instanceType.includes(state.filter.name)) {
        return false;
      }
      if (state.filter.memory && t.memory < state.filter.memory) {
        return false;
      }
      if (state.filter.vcpu && t.vcpu < state.filter.vcpu) {
        return false;
      }
      if (state.filter.storage && t.storage < state.filter.storage) {
        return false;
      }
      return true;
    }

    const rows = sortTypes(state.types, state.sort, costs).filter(typeFilter).map(makeRow);
    if (rows.length === 0) {
      const colspan = state.columns.length + state.priceColumns.length * state.reserveColumns.length;
      rows.push(html`
        <tr id='empty'><td colspan=${colspan}>no matching instance types</td></tr>
      `);
    }
    return html`
<div>
  <div class="settings">
    <label for="select-region">Region:</label>
    <div>
      <label><select id="select-region" onchange=${setRegion}>${regions.map(r => html`<option selected=${r.id === state.region} value=${r.id}>${r.label}</option>`)}</select></label>
      <label>Hide Unavailable Types: <input type="checkbox" checked=${state.filter.unavailable} onchange=${toggleFilterUnavailable} /></label>
    </div>
    <label>Columns:</label>
    <div>
      ${columnOptions.map((c) => html`<label><input type="checkbox" checked=${state.columns.find((sc) => sc.name === c.name) != null} onchange=${toggleColumn} />${c.name}</label>`)}
    </div>
    <label>Prices:</label>
    <div>
      <div><label>per <select onchange=${setPriceScale}>${Object.keys(priceScales).map(r => html`<option selected=${r === state.priceScale} value=${r}>${r}</option>`)}</select> (in USD)</label></div>
      <div>${renderPriceOptions(state)}</div>
      <div>${reserveOptions.filter((ro) => ro.name === 'On Demand').map((ro) => renderReserveOption(state, ro))}</div>
      <div>${reserveOptions.filter((ro) => /standard/.test(ro.name)).map((ro) => renderReserveOption(state, ro))}</div>
      <div>${reserveOptions.filter((ro) => /convertible/.test(ro.name)).map((ro) => renderReserveOption(state, ro))}</div>
    </div>
    <label>Filter:</label>
    <div>
      <label>Name: <input type="text" value=${state.filter.name} oninput=${updateFilterName} onchange=${updateFilterName} /></label>
      <label>Memory: <input type="number" value=${state.filter.memory} oninput=${updateFilterMemory} onchange=${updateFilterMemory} /></label>
      <label>vCPUs: <input type="number" value=${state.filter.vcpu} oninput=${updateFilterVcpu} onchange=${updateFilterVcpu} /></label>
      <label>Storage: <input type="number" value=${state.filter.storage} oninput=${updateFilterStorage} onchange=${updateFilterStorage} /></label>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        ${renderColumnHeaders(state)}
        ${renderPriceHeaders(state)}
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  <p>Prices current as of ${date}</p>
</div>
  `;
  });
}

let batch = 0;
const root = document.getElementById('root');

function render(state) {
  const current = ++batch;
  Promise.resolve(render0(state)).then((el) => {
    if (current === batch) {
      morph(root, el)
    }
  });
}

render(state);
