/**
 * 日志工具
 * 支持同时输出到控制台和文件
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dayjs from 'dayjs';

class Logger {
  constructor() {
    const logFilePath = process.env.LOG_FILE_PATH || '';

    // 支持相对路径，相对于项目根目录
    if (logFilePath) {
      if (path.isAbsolute(logFilePath)) {
        this.logFile = logFilePath;
      } else {
        // 相对路径，解析为相对于项目根目录（package.json 所在目录）
        const currentFilePath = fileURLToPath(import.meta.url);
        const projectRoot = path.resolve(path.dirname(currentFilePath), '../..');
        this.logFile = path.join(projectRoot, logFilePath);
      }
    } else {
      this.logFile = '';
    }

    // 日志文件最大大小（MB），默认10MB
    this.maxSize = parseInt(process.env.LOG_MAX_SIZE || '10', 10) * 1024 * 1024;
    this.enableFileLog = !!this.logFile;

    if (this.enableFileLog) {
      try {
        // 确保日志目录存在
        const logDir = path.dirname(this.logFile);
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }

        // 测试是否可写
        fs.appendFileSync(this.logFile, '');
        console.log(`✅ 日志文件已启用: ${this.logFile} (最大: ${Math.round(this.maxSize / 1024 / 1024)}MB)`);
      } catch (error) {
        console.error(`❌ 无法写入日志文件 ${this.logFile}: ${error.message}`);
        this.enableFileLog = false;
      }
    }
  }

  /**
   * 格式化日志时间
   * @returns {string}
   */
  getTimestamp() {
    return dayjs().format('YYYY-MM-DD HH:mm:ss');
  }

  /**
   * 检查并轮转日志文件
   */
  checkAndRotateLog() {
    try {
      // 检查文件是否存在
      if (!fs.existsSync(this.logFile)) {
        return;
      }

      // 获取文件大小
      const stats = fs.statSync(this.logFile);
      if (stats.size < this.maxSize) {
        return;
      }

      // 文件过大，执行轮转
      const backupFile = `${this.logFile}.1`;

      // 删除旧的备份文件
      if (fs.existsSync(backupFile)) {
        fs.unlinkSync(backupFile);
      }

      // 重命名当前日志文件为备份文件
      fs.renameSync(this.logFile, backupFile);

      // 记录轮转信息到新文件
      const rotateMessage = `[${this.getTimestamp()}] [INFO] 📋 日志文件已轮转 (旧文件: ${backupFile}, 大小: ${(stats.size / 1024 / 1024).toFixed(2)}MB)\n`;
      fs.writeFileSync(this.logFile, rotateMessage, 'utf-8');

      console.log(`📋 日志文件已轮转，旧日志保存为: ${backupFile}`);
    } catch (error) {
      console.error(`❌ 日志轮转失败: ${error.message}`);
    }
  }

  /**
   * 写入日志文件
   * @param {string} level 日志级别
   * @param {Array} args 日志参数
   */
  writeToFile(level, args) {
    if (!this.enableFileLog) return;

    try {
      // 写入前检查是否需要轮转
      this.checkAndRotateLog();

      const timestamp = this.getTimestamp();
      const message = args
        .map((arg) => {
          if (typeof arg === 'object') {
            try {
              return JSON.stringify(arg);
            } catch (e) {
              return String(arg);
            }
          }
          return String(arg);
        })
        .join(' ');

      const logLine = `[${timestamp}] [${level}] ${message}\n`;
      fs.appendFileSync(this.logFile, logLine, 'utf-8');
    } catch (error) {
      // 写入失败时静默处理，避免影响主程序
    }
  }

  /**
   * 普通日志
   * @param {...any} args
   */
  log(...args) {
    console.log(...args);
    this.writeToFile('INFO', args);
  }

  /**
   * 信息日志
   * @param {...any} args
   */
  info(...args) {
    console.info(...args);
    this.writeToFile('INFO', args);
  }

  /**
   * 警告日志
   * @param {...any} args
   */
  warn(...args) {
    console.warn(...args);
    this.writeToFile('WARN', args);
  }

  /**
   * 错误日志
   * @param {...any} args
   */
  error(...args) {
    console.error(...args);
    this.writeToFile('ERROR', args);
  }

  /**
   * 调试日志
   * @param {...any} args
   */
  debug(...args) {
    if (process.env.NODE_ENV === 'development') {
      console.debug(...args);
      this.writeToFile('DEBUG', args);
    }
  }
}

// 导出单例
const logger = new Logger();
export default logger;
