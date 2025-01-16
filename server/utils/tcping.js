const net = require('net');

async function tcpPing(host, port, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const start = process.hrtime.bigint();
    const socket = new net.Socket();

    socket.setTimeout(timeout);
    socket.on('connect', () => {
      socket.destroy();
      const diff = process.hrtime.bigint() - start;
      const elapsedMs = Number(diff) / 1_000_000;
      resolve(Math.floor(elapsedMs)); // 输出为整数毫秒
    });
    socket.on('error', err => reject(err));
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('Connection timed out'));
    });

    socket.connect(port, host);
  });
}

module.exports = tcpPing;
