import { Socket } from 'net';

/**
 * 执行TCP Ping测试，测量连接到指定主机和端口的延迟
 * @param {string} host 目标主机地址
 * @param {number} port 目标端口
 * @param {number} timeout 超时时间(毫秒)，默认10秒
 * @returns {Promise<number>} 连接延迟(毫秒)
 */
async function tcpPing(host, port, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const start = process.hrtime.bigint();
    const socket = new Socket();
    let isSocketClosed = false;

    // 确保socket资源被正确释放
    const cleanupSocket = () => {
      if (!isSocketClosed) {
        isSocketClosed = true;
        try {
          socket.removeAllListeners();
          socket.destroy();
        } catch (err) {
          console.error('关闭socket时出错:', err);
        }
      }
    };

    // 设置超时
    socket.setTimeout(timeout);

    // 连接成功事件处理
    socket.on('connect', () => {
      const diff = process.hrtime.bigint() - start;
      const elapsedMs = Number(diff) / 1_000_000;
      cleanupSocket();
      resolve(Math.floor(elapsedMs)); // 输出为整数毫秒
    });

    // 错误处理
    socket.on('error', (err) => {
      cleanupSocket();
      reject(new Error(`连接错误: ${err.message || '未知错误'}`));
    });

    // 超时处理
    socket.on('timeout', () => {
      cleanupSocket();
      reject(new Error('连接超时'));
    });

    // 确保在进程退出时关闭socket
    process.once('SIGINT', cleanupSocket);
    process.once('SIGTERM', cleanupSocket);

    // 尝试连接
    try {
      socket.connect(port, host);
    } catch (err) {
      cleanupSocket();
      reject(new Error(`创建连接时出错: ${err.message || '未知错误'}`));
    }
  });
}

export default tcpPing;
