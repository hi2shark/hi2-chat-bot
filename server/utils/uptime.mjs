/**
 * 上报机器人状态
 */

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
    const response = await fetch(uptimeKumaUrl);
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
