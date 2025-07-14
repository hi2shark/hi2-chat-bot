/**
 * 上报机器人状态
 */

import tcpPing from './tcping.mjs';

// 全局变量管理定时器
let reportingInterval = null;

/**
 * 处理带有ping参数的URL
 * @param {string} url 原始URL
 * @returns {Promise<string>} 处理后的URL
 */
async function processPingUrl(url) {
  try {
    const urlObj = new URL(url);

    // 检查是否包含ping=参数
    if (urlObj.host && urlObj.searchParams.has('ping') && urlObj.searchParams.get('ping') === '') {
      if (urlObj.host) {
        // 根据协议设置默认端口：http为80，https为443
        const defaultPort = urlObj.protocol === 'https:' ? 443 : 80;
        const port = urlObj.searchParams.get('port') || defaultPort;

        try {
          // 执行tcping获取延迟
          const pingTime = await tcpPing(urlObj.host, parseInt(port, 10));

          // 更新ping参数值
          urlObj.searchParams.set('ping', pingTime.toString());

          return urlObj.toString();
        } catch (pingError) {
          console.error('执行tcping失败:', pingError.message);
        }
      }
    }

    // 如果不需要处理或处理失败，返回原始URL
    return url;
  } catch (error) {
    console.error('处理ping URL出错:', error.message);
    return url;
  }
}

/**
 * 发送健康状态到Uptime Kuma
 * @param {number} retryCount 当前重试次数
 * @returns {Promise<void>}
 */
async function reportStatus(retryCount = 0) {
  const uptimeKumaUrl = process.env.UPTIME_KUMA_PUSH_URL;
  const maxRetries = 3;

  if (!uptimeKumaUrl) {
    return;
  }

  try {
    // 处理URL中的ping参数
    const processedUrl = await processPingUrl(uptimeKumaUrl);

    // 设置请求超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

    const response = await fetch(processedUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Hi2-Chat-Bot/2.0.7',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.text();
    console.log(`上报状态成功: ${result}`);
  } catch (error) {
    const errorMessage = error.name === 'AbortError' ? '请求超时' : error.message;
    console.error(`上报状态失败 (尝试 ${retryCount + 1}/${maxRetries + 1}): ${errorMessage}`);

    // 实现指数退避重试
    if (retryCount < maxRetries) {
      const delay = (2 ** retryCount) * 1000 + Math.random() * 1000; // 1-2秒, 2-4秒, 4-8秒
      console.log(`${delay}ms 后重试...`);
      setTimeout(() => {
        reportStatus(retryCount + 1);
      }, delay);
    } else {
      console.error('上报状态最终失败，已达到最大重试次数');
    }
  }
}

/**
 * 启动健康状态上报
 * 每30秒上报一次
 */
export function startUptimeReporting() {
  // 如果已经存在定时器，先清理
  if (reportingInterval) {
    clearInterval(reportingInterval);
    reportingInterval = null;
  }

  // 启动时立即上报一次
  reportStatus();

  // 设置定时任务，每30秒上报一次
  reportingInterval = setInterval(reportStatus, 30000);

  return reportingInterval;
}

/**
 * 停止健康状态上报
 */
export function stopUptimeReporting() {
  if (reportingInterval) {
    clearInterval(reportingInterval);
    reportingInterval = null;
  }
}

export default startUptimeReporting;
