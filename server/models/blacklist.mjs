import Base from './base.mjs';

class Blacklist extends Base {
  constructor() {
    super('blacklist');
  }

  /**
   * 根据用户ID查询黑名单
   * @param {string} userId 用户ID
   * @returns {Promise<Object>} 黑名单数据
   */
  queryByUserId(userId) {
    return this.findOne({
      userId,
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
   * @param {string} userId 用户ID
   * @returns {Promise<Object>} 删除结果
   */
  removeByUserId(userId) {
    return this.remove({ userId });
  }
}

export default Blacklist;
