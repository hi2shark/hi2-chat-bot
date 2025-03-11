import Base from './base.mjs';

class User extends Base {
  constructor() {
    super('user');
  }

  /**
   * 创建用户
   * @param {Object} data 用户数据
   * @returns {Promise<Object>} 创建结果
   */
  async create(data) {
    const addData = {
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
      msgCount: 0,
    };
    return super.create(addData);
  }

  /**
   * 更新用户
   * @param {Object} where 查询条件
   * @param {Object} data 更新数据
   * @returns {Promise<Object>} 更新结果
   */
  async update(where, data) {
    const updateData = {
      ...data,
      updatedAt: new Date(),
    };
    return super.update(where, updateData);
  }

  /**
   * 增加消息计数
   * @param {string} userId 用户ID
   */
  async incrementMsgCount(userId) {
    const user = await this.findOne({ userId });
    if (!user) {
      throw new Error('User not found');
    }
    const { collection } = await this.connect();
    const safeWhere = this.handleWhere({ userId });
    return collection.updateOne(
      safeWhere,
      {
        $inc: { msgCount: 1 },
        $set: { updatedAt: new Date() },
      },
    );
  }
}

export default User;
