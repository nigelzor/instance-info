import { instanceTypeCompare } from '../sort.js';

test('instance sort', () => {
  const input = [
    'z1d.xlarge',
    'z1d.large',
    'z1d.2xlarge',
    'z1d.12xlarge',
    't1.micro',
    't2.xlarge',
    't2.medium',
    't2.large',
    't2.small',
    'z1d.3xlarge',
    't2.micro',
    't2.nano',
    'z1d.6xlarge',
    't2.2xlarge',
  ];
  input.sort(instanceTypeCompare);
  expect(input).toEqual([
    't1.micro',
    't2.nano',
    't2.micro',
    't2.small',
    't2.medium',
    't2.large',
    't2.xlarge',
    't2.2xlarge',
    'z1d.large',
    'z1d.xlarge',
    'z1d.2xlarge',
    'z1d.3xlarge',
    'z1d.6xlarge',
    'z1d.12xlarge',
  ]);
});
