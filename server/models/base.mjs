/**
 * 数据模型基类
 * 提供基础的数据库操作方法
 */

import {
  MongoClient,
  ObjectId,
} from 'mongodb';
import autoId from '../db/auto-id.mjs';

const {
  MONGODB_URL,
  MONGODB_NAME,
} = process.env;

// 创建单例连接
const client = new MongoClient(MONGODB_URL);
let dbConnection = null;

class Base {
  /**
   * 构造函数
   * @param {string} collectionName 集合名称
   */
  constructor(collectionName) {
    this.collectionName = collectionName;
  }

  /**
   * 处理查询条件
   * @param {Object} where 查询条件
   * @returns {Object} 处理后的查询条件
   */
  handleWhere(where) {
    // 优化后的清理函数
    const sanitize = (obj) => {
      if (!obj || typeof obj !== 'object') return obj;

      if (obj instanceof ObjectId) {
        return obj;
      }

      return Object.entries(obj).reduce((acc, [key, value]) => {
        // 递归处理嵌套对象
        if (Array.isArray(value)) {
          acc[key] = value.map(sanitize);
        } else if (typeof value === 'object' && value !== null) {
          acc[key] = sanitize(value);
        } else if (typeof value === 'string') {
          acc[key] = value.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        } else {
          acc[key] = value;
        }
        return acc;
      }, {});
    };

    // 转换_id
    const handleId = (obj) => {
      if (obj._id && !(obj._id instanceof ObjectId)) {
        obj._id = autoId(obj._id);
      }
      return obj;
    };

    // 完整的处理流程
    try {
      return handleId(sanitize(where || {}));
    } catch (e) {
      console.error('查询条件处理失败:', e);
      return {};
    }
  }

  /**
   * 创建数据库连接
   * @returns {Promise<Object>} 返回数据库和集合对象
   */
  async connect() {
    if (!dbConnection) {
      await client.connect();
      dbConnection = client.db(MONGODB_NAME);
    }
    const collection = dbConnection.collection(this.collectionName);
    return {
      db: dbConnection,
      collection,
    };
  }

  /**
   * 关闭数据库连接
   */
  static async closeConnection() {
    if (dbConnection) {
      await client.close();
      dbConnection = null;
    }
  }

  /**
   * 创建文档
   * @param {Object} info 文档信息
   * @returns {Promise<Object>} 创建结果
   */
  async create(info) {
    const { collection } = await this.connect();
    try {
      const res = await collection.insertMany([info]);
      return res;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  /**
   * 删除文档
   * @param {Object} where 删除条件
   * @returns {Promise<Object>} 删除结果
   */
  async remove(where) {
    const { collection } = await this.connect();
    const safeWhere = this.handleWhere(where);
    const res = await collection.deleteMany(safeWhere);
    return res;
  }

  /**
   * 更新文档
   * @param {Object} where 查询条件
   * @param {Object} info 更新信息
   * @returns {Promise<Object>} 更新结果
   */
  async update(where, info) {
    const { collection } = await this.connect();
    const safeWhere = this.handleWhere(where);
    const res = await collection.updateOne(
      safeWhere,
      {
        $set: info,
      },
    );
    return res;
  }

  /**
   * 根据条件查询文档
   * @param {Object} where 查询条件
   * @returns {Promise<Array>} 查询结果
   */
  async find(
    where = {},
    sort = {},
  ) {
    const { collection } = await this.connect();
    const safeWhere = this.handleWhere(where);
    const query = collection.find(safeWhere);
    if (Object.keys(sort).length) {
      query.sort(sort);
    }
    return query.toArray();
  }

  /**
   * 根据条件查询单个文档
   * @param {Object} where 查询条件
   * @returns {Promise<Object|null>} 查询结果，未找到返回null
   */
  async findOne(where = {}) {
    const { collection } = await this.connect();
    const safeWhere = this.handleWhere(where);
    return collection.findOne(safeWhere);
  }

  /**
   * 根据ID查询单个文档
   * @param {string} _id 文档ID
   * @returns {Promise<Object|null>} 查询结果，未找到返回null
   */
  async queryById(_id) {
    const { collection } = await this.connect();
    try {
      const safeWhere = this.handleWhere({
        _id,
      });
      const result = await collection.findOne(safeWhere);
      return result || null;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  /**
   * 查询文档列表
   * @param {Object} where 查询条件
   * @param {number} page 页码
   * @param {number} size 每页数量
   * @param {Object} sort 排序参数 {field: 1|-1}
   * @returns {Promise<Array>} 文档列表
   */
  async list(
    where = {},
    page = 1,
    size = 10,
    sort = {},
  ) {
    const { collection } = await this.connect();
    let list = [];
    try {
      const safeWhere = this.handleWhere(where);
      const query = collection.find(safeWhere);
      if (Object.keys(sort).length) {
        query.sort(sort);
      }
      query.limit(size).skip((page - 1) * size);
      list = await query.toArray();
    } catch (error) {
      console.error(error);
      list = [];
    }
    return list;
  }

  /**
   * 获取所有列表
   * @param {Object} where 查询条件
   * @param {Object} sort 排序参数 {field: 1|-1}
   * @returns {Promise<Array>} 列表
   */
  async allList(where = {}, sort = {}) {
    const { collection } = await this.connect();
    try {
      const safeWhere = this.handleWhere(where);
      const query = collection.find(safeWhere);
      if (Object.keys(sort).length) {
        query.sort(sort);
      }
      return await query.toArray();
    } catch (error) {
      console.error('获取所有列表失败:', error);
      return [];
    }
  }

  /**
   * 获取列表及总数量
   * @param {Object} where 查询条件
   * @param {number} page 页码
   * @param {number} size 每页数量
   * @param {Object} sort 排序参数 {field: 1|-1}
   * @returns {Promise<Object>} 列表及总数量
   */
  async listWithTotal(
    where = {},
    page = 1,
    size = 10,
    sort = {},
  ) {
    const { collection } = await this.connect();
    const safeWhere = this.handleWhere(where);

    const query = collection.find(safeWhere);
    if (Object.keys(sort).length) {
      query.sort(sort);
    }
    query.limit(size).skip((page - 1) * size);

    const list = await query.toArray();
    const total = await collection.countDocuments(safeWhere);

    return {
      list,
      total,
    };
  }

  /**
   * 根据条件查询并更新文档
   * @param {Object} filter 查询条件
   * @param {Object} update 更新信息
   * @param {Object} options 选项
   * @returns {Promise<Object>} 更新后的文档
   */
  async findOneAndUpdate(filter, update, options = {}) {
    const { collection } = await this.connect();
    const query = collection.findOneAndUpdate(
      filter,
      update,
      {
        returnDocument: 'after',
        ...options,
      },
    );
    return query.then((result) => result.value);
  }

  /**
   * 统计文档数量
   * @param {Object} where 查询条件
   * @returns {Promise<number>} 文档数量
   */
  async count(where = {}) {
    const { collection } = await this.connect();
    const safeWhere = this.handleWhere(where);
    return collection.countDocuments(safeWhere);
  }
}

export default Base;
