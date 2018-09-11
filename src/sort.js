const sizes = 'nano micro small medium large xlarge'.split(' ');

exports.instanceTypeCompare = function instanceTypeCompare(a, b) {
  if (a === b) return 0;
  const [af, as] = a.split('.', 2);
  const [bf, bs] = b.split('.', 2);
  if (af > bf) return 1;
  if (af < bf) return -1;
  let asi = sizes.indexOf(as);
  let bsi = sizes.indexOf(bs);
  if (asi === -1) asi = sizes.length;
  if (bsi === -1) bsi = sizes.length;
  if (asi > bsi) return 1;
  if (asi < bsi) return -1;
  if (as.length > bs.length) return 1;
  if (as.length < bs.length) return -1;
  if (as > bs) return 1;
  if (as < bs) return -1;
};
