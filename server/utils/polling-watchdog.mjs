/**
 * 轮询健康看门狗
 * 定期用 getMe() 探测 Telegram API 可达性，超时或失败时触发轮询重启
 */

import logger from './logger.mjs';

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 分钟
const DEFAULT_GETME_TIMEOUT_MS = 15000; // 15 秒
const RESTART_DELAY_MS = 5000; // 重启前等待 5 秒
const POLLING_HEALTHY_GRACE_MS = 10 * 60 * 1000; // 10 分钟内有过成功 getMe 视为健康

let watchdogTimer = null;
/** 最近一次 getMe 成功的时间戳，用于 Uptime Kuma 联动 */
let lastGetMeOkAt = 0;

/**
 * 带超时的 Promise 包装
 * @param {Promise} promise 原始 Promise
 * @param {number} ms 超时毫秒数
 * @returns {Promise}
 */
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`操作超时 (${ms}ms)`)), ms);
    }),
  ]);
}

/**
 * 执行一次健康检查：getMe 带超时，失败或超时则重启轮询
 * @param {TelegramBot} bot node-telegram-bot-api 实例
 * @param {{ myChatId?: number, getMeTimeoutMs?: number }} options
 */
async function runCheck(bot, options = {}) {
  const { myChatId, getMeTimeoutMs = DEFAULT_GETME_TIMEOUT_MS } = options;

  try {
    await withTimeout(bot.getMe(), getMeTimeoutMs);
    lastGetMeOkAt = Date.now();
    return;
  } catch (err) {
    logger.error('轮询看门狗: getMe 失败或超时，将重启轮询', err?.message || err);
    lastGetMeOkAt = 0;
  }

  try {
    await bot.stopPolling();
  } catch (stopErr) {
    logger.warn('stopPolling 调用异常（可能已停止）:', stopErr?.message);
  }

  setTimeout(() => {
    bot.startPolling({ restart: true }).catch((err) => {
      logger.error('看门狗触发 startPolling 失败:', err);
    });
    logger.log('轮询看门狗: 已触发轮询重启');
    if (myChatId && process.env.TG_NOTIFY_POLLING_ALERTS === '1') {
      bot.sendMessage(
        myChatId,
        '⚠️ 轮询看门狗: getMe 失败或超时，已触发轮询自动重启',
      ).catch(logger.error);
    }
  }, RESTART_DELAY_MS);
}

/**
 * 启动轮询健康看门狗
 * @param {TelegramBot} bot node-telegram-bot-api 实例
 * @param {{ intervalMs?: number, getMeTimeoutMs?: number, myChatId?: number }} options
 * @returns {NodeJS.Timeout|number} 定时器句柄，供 stop 使用
 */
export function startPollingWatchdog(bot, options = {}) {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }

  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const getMeTimeoutMs = options.getMeTimeoutMs ?? DEFAULT_GETME_TIMEOUT_MS;
  const { myChatId } = options;

  logger.log(`轮询看门狗已启动，间隔 ${intervalMs / 1000} 秒，getMe 超时 ${getMeTimeoutMs / 1000} 秒`);
  lastGetMeOkAt = Date.now(); // 启动时假定健康，避免首次上报前被判为不健康

  runCheck(bot, { myChatId, getMeTimeoutMs });
  watchdogTimer = setInterval(() => {
    runCheck(bot, { myChatId, getMeTimeoutMs });
  }, intervalMs);

  return watchdogTimer;
}

/**
 * 停止轮询健康看门狗
 */
export function stopPollingWatchdog() {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
    logger.log('轮询看门狗已停止');
  }
}

/**
 * 是否可视为「TG 轮询健康」（供 Uptime Kuma 等联动：不健康时不 push，以便监控变红）
 * 看门狗未启动时（lastGetMeOkAt 从未被写入）视为健康，保持原有 push 行为
 * @returns {boolean}
 */
export function getPollingHealthy() {
  if (lastGetMeOkAt === 0) return true; // 看门狗未参与，不做限制
  return (Date.now() - lastGetMeOkAt) < POLLING_HEALTHY_GRACE_MS;
}

export default { startPollingWatchdog, stopPollingWatchdog, getPollingHealthy };
