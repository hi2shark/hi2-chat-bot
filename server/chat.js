/**
 * TG Bot
 * 私聊转发机器人
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const TGDCTcping = require('./services/dc-tcping');

/**
 * ChatBot 类 - Telegram 机器人的聊天管理系统
 * @class
 * @description 管理 Telegram 机器人的私聊消息转发和用户黑名单功能
 * 
 * @property {Object} bot - Telegram 机器人实例
 * @property {number} myChatId - 机器人管理员的聊天 ID
 * @property {number} myUserId - 机器人管理员的用户 ID
 * @property {string} banJsonPath - 黑名单文件的存储路径
 * @property {Array<number>} banList - 被拉黑用户的 ID 列表
 * 
 * @method loadBanList - 从文件加载黑名单列表
 * @method saveBanList - 将黑名单列表保存到文件
 * @method initBanJson - 初始化黑名单 JSON 文件
 * @method matchFromUserId - 从回复消息中提取用户 ID
 * @method banUser - 将用户添加到黑名单
 * @method unbanUser - 将用户从黑名单中移除
 * @method handleCommand - 处理命令消息（/ban, /unban）
 * @method handlePrivateMessage - 处理私聊消息
 * @method initMessageHandler - 初始化消息处理器
 * 
 * @example
 * const bot = new TelegramBot(token, { polling: true });
 * const chatBot = new ChatBot(bot);
 */
class ChatBot {
  constructor(bot) {
    this.bot = bot;
    this.myChatId = +process.env.MY_CHAT_ID;
    this.uptimeUrl = process.env.UPTIME_URL;
    this.banJsonPath = path.join(__dirname, '../data/ban.json');
    this.banList = [];
    this.initBanJson();
    this.initMessageHandler();
    if (this.uptimeUrl) {
      this.eachReportUptime();
    }
  }

  /**
   * 加载黑名单列表
   * @returns {Array<number>} 黑名单用户ID数组
   * @throws {Error} 文件读取失败时返回空数组
   */
  loadBanList() {
    try {
      const data = fs.readFileSync(this.banJsonPath);
      if (!data) {
        return [];
      }
      return JSON.parse(data);
    } catch (error) {
      return [];
    }
  }

  /**
   * 保存黑名单列表到文件
   * @param {Array<number>} data 要保存的黑名单数组
   * @throws {Error} 文件写入失败时抛出异常
   */
  saveBanList(data) {
    // 兼容创建文件夹
    if (!fs.existsSync(path.dirname(this.banJsonPath))) {
      fs.mkdirSync(path.dirname(this.banJsonPath), { recursive: true });
    }
    fs.writeFileSync(this.banJsonPath, JSON.stringify(data));
  }

  /**
   * 初始化黑名单
   * 如果文件不存在或为空，则创建包含空数组的文件
   */
  initBanJson() {
    this.banList = this.loadBanList();
    if (!this.banList.length) {
      this.saveBanList([]);
    }
  }

  /**
   * 从回复消息中解析原发送者的用户ID
   * @param {Object} msg Telegram消息对象
   * @returns {number|null} 解析出的用户ID，解析失败返回null
   */
  matchFromUserId(msg) {
    if (!msg?.reply_to_message?.text?.match) {
      return null;
    }
    const matchUserId = msg.reply_to_message.text.match(/From:\s+(\d+)/);
    return matchUserId ? +matchUserId[1] : null;
  }

  /**
   * 拉黑用户
   * @param {Object} msg 包含要拉黑用户ID的回复消息
   */
  banUser(msg) {
    if (msg.chat.type === 'private') {
      const banUserId = this.matchFromUserId(msg);
      if (this.banList.includes(banUserId)) {
        this.bot.sendMessage(this.myChatId, `From: ${banUserId} - 已经拉黑，无需重复处理`);
        return;
      }
      this.banList.push(banUserId);
      this.saveBanList(this.banList);
      this.bot.sendMessage(this.myChatId, `From: ${banUserId} - 已经拉黑`);
    }
  }

  /**
   * 解除用户黑名单
   * @param {Object} msg 包含要解除黑名单用户ID的回复消息
   */
  unbanUser(msg) {
    if (msg.chat.type === 'private') {
      const banUserId = this.matchFromUserId(msg);
      if (!this.banList.includes(banUserId)) {
        this.bot.sendMessage(this.myChatId, `From: ${banUserId} - 未拉黑，无需处理`);
        return;
      }
      this.banList = this.banList.filter((id) => id !== banUserId);
      this.saveBanList(this.banList);
      this.bot.sendMessage(this.myChatId, `From: ${banUserId} - 已经解除拉黑`);
    }
  }

  /**
   * 处理命令消息
   * @param {Object} msg Telegram消息对象
   * @description 仅机器人管理员可执行 /ban 和 /unban 命令
   */
  handleCommand(msg) {
    if (msg.from.id === this.myChatId) {
      const command = msg.text.split(' ')[0];
      switch (command) {
        case '/ban':
          this.banUser(msg);
          break;
        case '/unban':
          this.unbanUser(msg);
          break;
        case '/banlist':
          this.bot.sendMessage(msg.chat.id, `BanList: \n${this.banList.join('\n')}`);
          break;
        case '/ping': {
          // 读取消息时间，计算延迟并返回
          const now = Date.now();
          const messageTime = msg.date * 1000;
          const delay = now - messageTime;
          this.bot.sendMessage(msg.chat.id, `pong - ${delay}ms`);
          break;
        }
        case '/dc':
          this.dcPing(msg);
          break;
        default:
          break;
      }
    }
  }

  /**
   * 检测Telegram数据中心延迟
   * @description 使用tg-dc-tcping模块检测Telegram数据中心延迟
   */
  dcPing(msg) {
    TGDCTcping().then((res) => {
      this.bot.sendMessage(msg?.chat?.id || this.myChatId, res.map((i, index) => {
        if (i === null) {
          return `DC${index + 1}: timeout`;
        }
        return `DC${index + 1}: ${i}ms`;
      }).join('\n'));
    }).catch((error) => {
      console.log(error);
      this.bot.sendMessage(this.myChatId, `tg dc ping error: ${error?.message}`);
    });
  }

  /**
   * 处理私聊消息
   * @param {Object} msg Telegram消息对象
   * @description 处理管理员和普通用户的私聊消息转发
   */
  handlePrivateMessage(msg) {
    if (msg.from.id === this.myChatId) {
      if (msg.reply_to_message) {
        const replyUserId = this.matchFromUserId(msg);
        if (replyUserId) {
          this.bot.copyMessage(replyUserId, msg.chat.id, msg.message_id);
        }
      }
    } else {
      if (this.banList.includes(msg.from.id)) {
        return;
      }
      this.bot.forwardMessage(this.myChatId, msg.chat.id, msg.message_id);
      this.bot.sendMessage(this.myChatId, `From: ${msg.chat.id}`);
    }
  }

  /**
   * 初始化消息处理器
   * @description 注册消息事件监听，分发命令和私聊消息
   */
  initMessageHandler() {
    this.bot.on('message', (msg) => {
      if (msg.text && msg.text.startsWith('/')) {
        this.handleCommand(msg);
        return;
      }
      if (msg.chat.type === 'private') {
        this.handlePrivateMessage(msg);
      }
    });
    // 启动成功后通知管理员
    this.bot.sendMessage(this.myChatId, '✨🤖✨🤖✨🤖✨\n ChatBot启动成功');
    this.dcPing();
  }

  /**
   * 上报机器人运行状态
   */
  async reportUptime() {
    if (!this.uptimeUrl) {
      return;
    }
    await axios.get(this.uptimeUrl);
  }

  /**
   * 每隔一段时间上报机器人运行状态
   */
  async eachReportUptime() {
    await this.reportUptime();
    setTimeout(() => {
      this.eachReportUptime();
    }, 1000 * (process.env.UPTIME_INTERVAL || 60));
  }
}

module.exports = (bot) => new ChatBot(bot);
