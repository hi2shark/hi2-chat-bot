import tcping from './tcping.mjs';

/**
 * Telegram数据中心IP地址配置
 * @see https://core.telegram.org/resources/cidr
 */
const TG_DATACENTERS = {
  dc1: '149.154.175.50',   // DC1 - 美国迈阿密
  dc2: '149.154.167.50',   // DC2 - 荷兰阿姆斯特丹
  dc3: '149.154.175.100',  // DC3 - 美国迈阿密
  dc4: '149.154.167.91',   // DC4 - 荷兰阿姆斯特丹
  dc5: '91.108.56.100',    // DC5 - 新加坡
};

/**
 * 对单个数据中心执行ping测试，支持重试
 * @private
 */
const pingWithRetry = async (dcName, ip, port, timeout, retries, verbose) => {
  // 记录日志
  if (verbose) {
    console.log(`测试 ${dcName} (${ip}:${port}) 中...`);
  }

  // 进行指定次数的重试
  // eslint-disable-next-line no-restricted-syntax
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await tcping(ip, port, timeout);
      if (verbose && attempt > 0) {
        console.log(`${dcName} 在第 ${attempt + 1} 次尝试成功`);
      }
      return result;
    } catch (error) {
      if (verbose) {
        console.error(`${dcName} 第 ${attempt + 1} 次尝试失败: ${error.message}`);
      }
    }
  }

  // 所有尝试都失败
  if (verbose) {
    console.error(`${dcName} 所有尝试均失败，放弃测试`);
  }
  return null;
};

/**
 * 测试Telegram各数据中心的连接延迟
 * @param {Object} options 配置选项
 * @param {number} [options.timeout=5000] 超时时间(毫秒)
 * @param {number} [options.port=443] 测试端口
 * @param {number} [options.retries=1] 重试次数
 * @param {boolean} [options.verbose=false] 是否输出详细日志
 * @returns {Promise<Array<number|null>>} 各数据中心的延迟(毫秒)，超时或错误为null
 */
async function testTelegramDCs(options = {}) {
  const {
    timeout = 5000,
    port = 443,
    retries = 1,
    verbose = false,
  } = options;

  try {
    // 并行测试所有DC，保持顺序
    const results = await Promise.all([
      pingWithRetry('DC1', TG_DATACENTERS.dc1, port, timeout, retries, verbose),
      pingWithRetry('DC2', TG_DATACENTERS.dc2, port, timeout, retries, verbose),
      pingWithRetry('DC3', TG_DATACENTERS.dc3, port, timeout, retries, verbose),
      pingWithRetry('DC4', TG_DATACENTERS.dc4, port, timeout, retries, verbose),
      pingWithRetry('DC5', TG_DATACENTERS.dc5, port, timeout, retries, verbose),
    ]);
    return results;
  } catch (error) {
    console.error('测试Telegram数据中心时发生严重错误:', error);
    return [null, null, null, null, null];
  }
}

// 导出默认配置的测试函数
export default async (options = {}) => testTelegramDCs(options);
