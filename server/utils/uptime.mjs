/**
 * 上报机器人状态
 */

import tcpPing from './tcping.mjs';

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
 * @returns {Promise<void>}
 */
async function reportStatus() {
  const uptimeKumaUrl = process.env.UPTIME_KUMA_PUSH_URL;

  if (!uptimeKumaUrl) {
    return;
  }

  try {
    // 处理URL中的ping参数
    const processedUrl = await processPingUrl(uptimeKumaUrl);

    const response = await fetch(processedUrl);
    const result = await response.text();
    console.log(`上报状态成功: ${result}`);
  } catch (error) {
    // 忽略网络错误，避免程序崩溃
    console.error('上报状态失败，已忽略错误:', error.message);
  }
}

/**
 * 启动健康状态上报
 * 每30秒上报一次
 */
export function startUptimeReporting() {
  // 启动时立即上报一次
  reportStatus();

  // 设置定时任务，每30秒上报一次
  const intervalId = setInterval(reportStatus, 30000);

  return intervalId;
}

export default startUptimeReporting;
