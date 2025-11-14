/**
 * 黑名单服务
 */

import models from '../models/index.mjs';

class BlacklistService {
  /**
   * 检查用户是否在黑名单中
   * @param {number} chatId 用户ID
   * @returns {Object|null} 黑名单对象或null
   */
  async check(chatId) {
    const blacklistModel = new models.Blacklist();
    const item = await blacklistModel.queryByChatId(chatId);
    if (item) {
      return {
        success: true,
        data: item,
      };
    }
    return {
      success: false,
      message: '该用户不存在于黑名单中',
    };
  }

  /**
   * 根据消息对象检查用户是否在黑名单中
   * @param {Object} msg 消息对象
   * @returns {Object} 检查结果
   */
  async checkFromMessage(msg) {
    const chatId = msg.from.id;
    const checkResult = await this.check(chatId);
    return checkResult;
  }

  /**
   * 添加用户到黑名单
   * @param {number} chatId 用户ID
   * @param {string} nickname 用户昵称
   * @param {string} remark 备注
   */
  async add(chatId, nickname = '', remark = '') {
    // 确认chatId是否存在
    const checkResult = await this.check(chatId);
    if (checkResult.success) {
      return {
        success: false,
        message: '该用户已存在于黑名单中',
      };
    }
    const blacklistModel = new models.Blacklist();
    const created = await blacklistModel.create({
      chatId,
      nickname,
      remark,
    });
    if (created?.acknowledged) {
      return {
        success: true,
        message: '添加成功',
      };
    }
    return {
      success: false,
      message: '添加失败',
    };
  }

  /**
   * 从黑名单中移除用户
   * @param {number} chatId 用户ID
   */
  async remove(chatId) {
    // 确认chatId是否存在
    const checkResult = await this.check(chatId);
    if (!checkResult.success) {
      return checkResult;
    }
    const blacklistModel = new models.Blacklist();
    const removed = await blacklistModel.removeByChatId(chatId);
    if (removed?.acknowledged) {
      return {
        success: true,
        message: '移除成功',
      };
    }
    return {
      success: false,
      message: '移除失败',
    };
  }

  /**
   * 获取黑名单列表
   * @returns {Array} 黑名单列表，按时间降序排序（最新的在前）
   */
  async list() {
    const blacklistModel = new models.Blacklist();
    // 按 createdAt 降序排序（-1 表示降序，最新的在前）
    const list = await blacklistModel.allList({}, { createdAt: -1 });
    return {
      success: true,
      data: list,
    };
  }

  /**
   * 搜索黑名单
   * @param {string} keyword 搜索关键词（用户ID或昵称）
   * @returns {Object} 搜索结果
   */
  async search(keyword) {
    if (!keyword || keyword.trim().length === 0) {
      return {
        success: false,
        message: '请提供搜索关键词',
      };
    }

    const blacklistModel = new models.Blacklist();
    const trimmedKeyword = keyword.trim();

    // 尝试作为数字ID搜索
    const chatIdNumber = parseInt(trimmedKeyword, 10);

    // 构建查询条件：匹配 chatId 或 nickname 或 remark
    const results = [];

    try {
      // 如果是有效的数字，搜索 chatId
      if (!Number.isNaN(chatIdNumber)) {
        const exactMatch = await blacklistModel.findOne({ chatId: chatIdNumber });
        if (exactMatch) {
          results.push(exactMatch);
        }
      }

      // 搜索昵称和备注（使用正则表达式进行模糊匹配）
      const { collection } = await blacklistModel.connect();
      const regex = new RegExp(trimmedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

      const textMatches = await collection.find({
        $or: [
          { nickname: { $regex: regex } },
          { remark: { $regex: regex } },
        ],
      }).sort({ createdAt: -1 }).toArray();

      // 合并结果并去重
      const allResults = [...results, ...textMatches];
      const uniqueResults = Array.from(
        new Map(allResults.map((item) => [item.chatId, item])).values(),
      );

      return {
        success: true,
        data: uniqueResults,
        keyword: trimmedKeyword,
      };
    } catch (error) {
      return {
        success: false,
        message: `搜索失败: ${error.message}`,
      };
    }
  }
}

export default BlacklistService;
