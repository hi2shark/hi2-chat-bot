import Base from './base.mjs';

class Blacklist extends Base {
  constructor() {
    super('blacklist');
  }

  /**
   * 根据用户ID查询黑名单
   * @param {string} chatId 用户ID
   * @returns {Promise<Object>} 黑名单数据
   */
  queryByChatId(chatId) {
    return this.findOne({
      chatId,
    });
  }

  /**
   * 添加黑名单
   * @param {Object} data 黑名单数据
   * @returns {Promise<Object>} 添加结果
   */
  create(data) {
    const addData = {
      ...data,
      createdAt: new Date(),
    };
    return super.create(addData);
  }

  /**
   * 根据用户ID删除黑名单
   * @param {string} chatId 用户ID
   * @returns {Promise<Object>} 删除结果
   */
  removeByChatId(chatId) {
    return this.remove({ chatId });
  }
}

export default Blacklist;
