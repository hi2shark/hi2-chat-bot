/**
 * 用户服务
 */

import User from '../models/user.mjs';

class UserService {
  constructor() {
    this.userModel = new User();
  }

  /**
   * 从消息中获取用户信息进行记录
   * @param {Object} message 消息对象
   */
  async updateUserFromMessage(message) {
    const { from } = message;
    const user = await this.userModel.findOne({ userId: from.id });
    if (!user) {
      await this.userModel.create({
        userId: from.id,
        nickname: from.first_name || from.username || '',
      });
    }
    // 增加消息计数
    await this.userModel.incrementMsgCount(from.id);
  }

  /**
   * 返回被回复消息的统计信息
   * @param {Object} message 消息对象
   * @returns {String}
   *  首次聊天：2025-03-10 12:00:00
   *  最近聊天：2025-03-10 12:00:00
   *  消息总数：100
   */
  async stats(message) {
    const { from } = message;
    const user = await this.userModel.findOne({ userId: from.id });
    if (!user) {
      return '该用户不存在';
    }
    return `首次聊天：${user.createdAt}\n最近聊天：${user.updatedAt}\n消息总数：${user.msgCount}`;
  }
}

export default UserService;
