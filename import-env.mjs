import dotenv from 'dotenv';

// 根据不同环境加载对应的环境变量文件
if (process.env.NODE_ENV === 'production') {
  // 生产环境使用 .env 和 .env.production.local 文件
  dotenv.config({
    path: '.env',
  });
  // 加载生产环境特定配置
  dotenv.config({
    path: '.env.production.local',
    override: true,
  });
} else if (process.env.NODE_ENV === 'development') {
  // 开发环境使用 .env.development 和 .env.development.local 文件
  dotenv.config({
    path: '.env.development',
  });
  // 加载开发环境特定配置
  dotenv.config({
    path: '.env.development.local',
    override: true,
  });
} else if (process.env.NODE_ENV === 'test') {
  // 测试环境使用 .env.test 和 .env.test.local 文件
  dotenv.config({
    path: '.env.test',
  });
  // 加载测试环境特定配置
  dotenv.config({
    path: '.env.test.local',
    override: true,
  });
} else {
  // 默认使用 .env 和 .env.local 文件
  dotenv.config({
    path: '.env',
  });
  // 加载本地特定配置，覆盖默认配置
  dotenv.config({
    path: '.env.local',
    override: true,
  });
}
