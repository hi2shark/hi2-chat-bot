import { Socket } from 'net';

// 全局socket追踪，用于紧急清理
const activeSockets = new Set();

/**
 * 添加socket到活动列表
 * @param {Socket} socket 
 */
function trackSocket(socket) {
  activeSockets.add(socket);
}

/**
 * 从活动列表移除socket
 * @param {Socket} socket 
 */
function untrackSocket(socket) {
  activeSockets.delete(socket);
}

/**
 * 清理所有活动的socket连接
 */
function cleanupAllSockets() {
  console.log(`正在清理 ${activeSockets.size} 个活动的socket连接...`);
  for (const socket of activeSockets) {
    try {
      if (!socket.destroyed) {
        socket.removeAllListeners();
        socket.destroy();
      }
    } catch (error) {
      console.error('清理socket时出错:', error);
    }
  }
  activeSockets.clear();
}

// 进程退出时清理所有socket
process.on('exit', cleanupAllSockets);
process.on('SIGINT', cleanupAllSockets);
process.on('SIGTERM', cleanupAllSockets);

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
    let timeoutHandle = null;

    // 追踪socket
    trackSocket(socket);

    // 确保socket资源被正确释放
    const cleanupSocket = () => {
      if (!isSocketClosed) {
        isSocketClosed = true;
        
        // 清理超时定时器
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
          timeoutHandle = null;
        }
        
        try {
          socket.removeAllListeners();
          if (!socket.destroyed) {
            socket.destroy();
          }
        } catch (err) {
          console.error('关闭socket时出错:', err);
        } finally {
          untrackSocket(socket);
        }
      }
    };

    // 设置超时处理
    timeoutHandle = setTimeout(() => {
      cleanupSocket();
      reject(new Error(`连接超时 (${timeout}ms)`));
    }, timeout);

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
export { cleanupAllSockets };
