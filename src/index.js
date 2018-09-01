import html from 'nanohtml';
import regions from './regions';
import types from '../data/ec2.json';
import classnames from 'classnames';

const region = 'us-east-1';

const state = {
  region,
  types: Object.values(types),
  highlight: new Set(),
};

state.types.sort((a, b) => a.instanceType < b.instanceType ? -1 : 1);

function toggleHighlight() {
  const id = this.id;
  state.highlight.delete(id) || state.highlight.add(id);
  render(state);
}

function render0(state) {
  const region = regions.find(r => r.id === state.region) || regions[0];
  return region.load().then(costs => {
    function makeRow(t) {
      const cost = (costs[t.instanceType] || []).find(c => c.Tenancy === 'Shared' && c.Name === 'Linux');
      return html`
      <tr id=${t.instanceType} class=${classnames(state.highlight.has(t.instanceType) && 'highlight')} onclick=${toggleHighlight}>
        <td>${t.instanceType}</td>
        <td>${t.info.memory}</td>
        <td>${t.info.ecu}</td>
        <td>${t.info.vcpu}</td>
        <td>${t.info.storage}</td>
        <td>${t.info.networkPerformance}</td>
        <td>$${cost && cost.OnDemand && cost.OnDemand[1]}</td>
      </tr>
      `;
    }

    return html`
<div>
  <p>Hello! ${state.region}</p>
  <table>
    <thead>
      <tr>
        <th>Name</th>
        <th>Memory</th>
        <th>ECU</th>
        <th>vCPUs</th>
        <th>Instance Storage</th>
        <th>Network Performance</th>
        <th>Linux $/hour</th>
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
