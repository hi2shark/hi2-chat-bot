/**
 * 黑名单服务
 */

import models from '../models/index.mjs';

class BlacklistService {
  /**
   * 检查用户是否在黑名单中
   * @param {number} userId 用户ID
   * @returns {Object|null} 黑名单对象或null
   */
  async check(userId) {
    const blacklistModel = new models.Blacklist();
    const item = await blacklistModel.queryByUserId(userId);
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
    const userId = msg.from.id;
    const checkResult = await this.check(userId);
    return checkResult;
  }

  /**
   * 添加用户到黑名单
   * @param {number} userId 用户ID
   * @param {string} nickname 用户昵称
   * @param {string} remark 备注
   */
  async add(userId, nickname = '', remark = '') {
    // 确认userId是否存在
    const checkResult = await this.check(userId);
    if (checkResult.success) {
      return {
        success: false,
        message: '该用户已存在于黑名单中',
      };
    }
    const blacklistModel = new models.Blacklist();
    const created = await blacklistModel.create({
      userId,
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
   * @param {number} userId 用户ID
   */
  async remove(userId) {
    // 确认userId是否存在
    const checkResult = await this.check(userId);
    if (!checkResult.success) {
      return checkResult;
    }
    const blacklistModel = new models.Blacklist();
    const removed = await blacklistModel.removeByUserId(userId);
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
   * @returns {Array} 黑名单列表
   */
  async list() {
    const blacklistModel = new models.Blacklist();
    const list = await blacklistModel.allList();
    return {
      success: true,
      data: list,
    };
  }
}

export default BlacklistService;
