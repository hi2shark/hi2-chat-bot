
const tcping = require('../utils/tcping');

const dc1 = '149.154.175.50';
const dc2 = '149.154.167.50';
const dc3 = '149.154.175.100';
const dc4 = '149.154.167.91';
const dc5 = '91.108.56.100';

module.exports = async () => {
  const tcpings = [dc1, dc2, dc3, dc4, dc5].map((dc) => tcping(dc, 443));
  return Promise.all(tcpings);
};
