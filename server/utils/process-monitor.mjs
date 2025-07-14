/**
 * 进程监控工具
 * 监控内存使用情况和性能指标
 */

import { EventEmitter } from 'events';

class ProcessMonitor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      interval: options.interval || 30000, // 30秒检查一次
      memoryThreshold: options.memoryThreshold || 100 * 1024 * 1024, // 100MB阈值
      enabled: options.enabled !== false,
      ...options,
    };
    
    this.isRunning = false;
    this.monitorTimer = null;
    this.startTime = Date.now();
    this.lastMemoryUsage = null;
  }

  /**
   * 获取格式化的内存使用情况
   */
  getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
      rss: Math.round(usage.rss / 1024 / 1024 * 100) / 100, // MB
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100, // MB
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024 * 100) / 100, // MB
      external: Math.round(usage.external / 1024 / 1024 * 100) / 100, // MB
      arrayBuffers: Math.round((usage.arrayBuffers || 0) / 1024 / 1024 * 100) / 100, // MB
    };
  }

  /**
   * 获取系统信息
   */
  getSystemInfo() {
    const uptime = Date.now() - this.startTime;
    const processUptime = process.uptime() * 1000;
    
    return {
      uptime: Math.round(uptime / 1000), // 秒
      processUptime: Math.round(processUptime / 1000), // 秒
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
    };
  }

  /**
   * 检查内存使用情况
   */
  checkMemory() {
    const current = this.getMemoryUsage();
    const system = this.getSystemInfo();
    
    // 检查内存增长
    if (this.lastMemoryUsage) {
      const heapGrowth = current.heapUsed - this.lastMemoryUsage.heapUsed;
      const rssGrowth = current.rss - this.lastMemoryUsage.rss;
      
      // 如果内存增长超过阈值，发出警告
      if (heapGrowth > this.options.memoryThreshold / 1024 / 1024) {
        this.emit('memoryWarning', {
          type: 'heap_growth',
          current,
          previous: this.lastMemoryUsage,
          growth: heapGrowth,
          message: `堆内存增长 ${heapGrowth.toFixed(2)} MB`,
        });
      }
      
      if (rssGrowth > this.options.memoryThreshold / 1024 / 1024) {
        this.emit('memoryWarning', {
          type: 'rss_growth',
          current,
          previous: this.lastMemoryUsage,
          growth: rssGrowth,
          message: `RSS内存增长 ${rssGrowth.toFixed(2)} MB`,
        });
      }
    }
    
    // 检查绝对内存使用量
    if (current.heapUsed > 200) { // 200MB
      this.emit('memoryWarning', {
        type: 'high_memory',
        current,
        message: `堆内存使用过高: ${current.heapUsed} MB`,
      });
    }
    
    // 更新上次内存使用记录
    this.lastMemoryUsage = current;
    
    // 发出监控事件
    this.emit('stats', {
      memory: current,
      system,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 开始监控
   */
  start() {
    if (!this.options.enabled || this.isRunning) {
      return;
    }
    
    this.isRunning = true;
    this.startTime = Date.now();
    
    console.log('进程监控已启动');
    
    // 立即执行一次检查
    this.checkMemory();
    
    // 设置定时检查
    this.monitorTimer = setInterval(() => {
      this.checkMemory();
    }, this.options.interval);
    
    this.emit('started');
  }

  /**
   * 停止监控
   */
  stop() {
    if (!this.isRunning) {
      return;
    }
    
    this.isRunning = false;
    
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
    
    console.log('进程监控已停止');
    this.emit('stopped');
  }

  /**
   * 获取当前状态报告
   */
  getStatusReport() {
    const memory = this.getMemoryUsage();
    const system = this.getSystemInfo();
    
    return {
      memory,
      system,
      monitoring: {
        isRunning: this.isRunning,
        interval: this.options.interval,
        memoryThreshold: this.options.memoryThreshold,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 格式化状态报告为可读文本
   */
  formatStatusReport() {
    const report = this.getStatusReport();
    const { memory, system } = report;
    
    const formatUptime = (seconds) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      return `${hours}h ${minutes}m ${secs}s`;
    };
    
    return `📊 系统状态报告
🕐 运行时间: ${formatUptime(system.uptime)}
💾 内存使用:
  • RSS: ${memory.rss} MB
  • 堆内存: ${memory.heapUsed} MB / ${memory.heapTotal} MB
  • 外部内存: ${memory.external} MB
  • 数组缓冲区: ${memory.arrayBuffers} MB
🖥️ 系统信息:
  • Node.js: ${system.nodeVersion}
  • 平台: ${system.platform} (${system.arch})
  • 进程ID: ${system.pid}
⚙️ 监控状态: ${this.isRunning ? '运行中' : '已停止'}`;
  }
}

export default ProcessMonitor; 