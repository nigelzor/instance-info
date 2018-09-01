const regions = [
  { id: 'us-gov-west-1', label: 'AWS GovCloud (US)', load: () => import('../data/ec2-us-gov-west-1.json') },
  { id: 'ap-south-1', label: 'Asia Pacific (Mumbai)', load: () => import('../data/ec2-ap-south-1.json') },
  { id: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)', load: () => import('../data/ec2-ap-northeast-1.json') },
  { id: 'ap-northeast-3', label: 'Asia Pacific (Osaka-Local)', load: () => import('../data/ec2-ap-northeast-3.json') },
  { id: 'ap-northeast-2', label: 'Asia Pacific (Seoul)', load: () => import('../data/ec2-ap-northeast-2.json') },
  { id: 'ap-southeast-1', label: 'Asia Pacific (Singapore)', load: () => import('../data/ec2-ap-southeast-1.json') },
  { id: 'ap-southeast-2', label: 'Asia Pacific (Sydney)', load: () => import('../data/ec2-ap-southeast-2.json') },
  { id: 'ca-central-1', label: 'Canada (Central)', load: () => import('../data/ec2-ca-central-1.json') },
  { id: 'eu-central-1', label: 'EU (Frankfurt)', load: () => import('../data/ec2-eu-central-1.json') },
  { id: 'eu-west-1', label: 'EU (Ireland)', load: () => import('../data/ec2-eu-west-1.json') },
  { id: 'eu-west-2', label: 'EU (London)', load: () => import('../data/ec2-eu-west-2.json') },
  { id: 'eu-west-3', label: 'EU (Paris)', load: () => import('../data/ec2-eu-west-3.json') },
  { id: 'sa-east-1', label: 'South America (Sao Paulo)', load: () => import('../data/ec2-sa-east-1.json') },
  { id: 'us-east-1', label: 'US East (N. Virginia)', load: () => import('../data/ec2-us-east-1.json') },
  { id: 'us-east-2', label: 'US East (Ohio)', load: () => import('../data/ec2-us-east-2.json') },
  { id: 'us-west-1', label: 'US West (N. California)', load: () => import('../data/ec2-us-west-1.json') },
  { id: 'us-west-2', label: 'US West (Oregon)', load: () => import('../data/ec2-us-west-2.json') },
];

export default regions;
