# TG私聊机器人

## 项目简介
TG私聊机器人可以将发送给机器人的私聊消息转发给您，并允许您回复这些消息。  
2.0版本升级为数据库版本，精简了机器人消息窗口，增加了消息撤回和黑名单等功能。  
支持Uptime Kuma健康状态上报，每30秒上报一次，建议健康监听范围值180秒。  

## 主要功能
- **消息转发**：将私聊消息自动转发给您/或者群组内
- **消息回复**：可以直接回复转发的消息与用户交流
- **消息编辑**：支持编辑已发送的消息
- **消息撤回**：支持撤回已发送的消息
- **黑名单管理**：可以拉黑和解除拉黑用户
- **群聊支持**：可以在群组中回复私聊消息
- **人机验证**：图形验证码验证，防止机器人骚扰
- **AI内容审核**：基于OpenAI的智能广告检测，自动拉黑违规用户

## 使用须知
- 机器人只会转发私聊信息给指定用户/指定群聊，不会转发群聊消息
- 如果转发到群聊中，需要机器人被拉入群聊！  
- 撤回消息需通过对已发送消息执行`/del`指令
- 机器人无法撤回或编辑48小时前的消息
- 媒体类消息编辑可能失败，此时会先删除旧消息再发送新消息

## 前置准备
1. 通过[@BotFather](https://t.me/BotFather)创建机器人获取Token
2. 通过[@userinfobot](https://t.me/userinfobot)获取您的ChatId
3. 如果无法获取ChatId，可先配置`TELEGRAM_BOT_TOKEN`，然后向机器人发送`/hello`指令获取

## 指令列表
| 指令 | 使用方式 | 说明 |
|------|---------|------|
| `/ban` | 回复/直接发送 | 拉黑用户：回复消息使用`/ban`或直接发送`/ban {userId} {备注}` |
| `/unban` | 回复/直接发送 | 解除拉黑：回复消息使用`/unban`或直接发送`/unban {userId}` |
| `/banlist` | 直接发送 | 查看当前黑名单列表（支持翻页，每页显示5条记录） |
| `/bansearch` | 直接发送 | 搜索黑名单，发送`/bansearch {关键词}`根据用户ID、昵称或备注搜索 |
| `/init` | 回复/直接发送 | 初始化用户状态（重置审核和验证码）：回复消息使用`/init`或直接发送`/init {userId}` |
| `/newcaptcha` | 直接发送（用户） | 重新获取验证码（用户在验证过程中使用） |
| `/testcaptcha` | 直接发送 | 测试验证码功能，生成测试验证码图片检查功能是否正常 |
| `/del` | 回复 | 撤回消息，别名：`/d`、`/c`、`/cancel`、`/remove` |
| `/ping` | 直接发送 | 检测机器人是否在线 |
| `/dc` | 直接发送 | 检测与Telegram服务器的连接延迟 |
| `/stats` | 回复 | 对转发的用户消息进行指令回复，获取用户聊天统计信息 |
| `/info` | 回复 | 获取消息详细信息（用户ID、昵称、消息数、黑名单状态、审核状态等） |
| `/status` | 直接发送 | 获取机器人系统状态 |
| `/test` | 直接发送 | 测试AI审核功能，发送`/test {测试文本}`验证大模型判定是否正常 |
| `/help` | 直接发送 | 显示所有指令和使用说明 |
| `/hello` | 直接发送 | 获取当前聊天的ChatId（未配置MY_CHAT_ID时可用） |

## 使用Docker Compose方式部署机器人

### 方式一：直接在 docker-compose.yml 中配置
```yaml
services:
  # 私聊机器人
  hi2ChatBot:
    container_name: hi2-chat-bot
    image: ghcr.io/hi2shark/hi2-chat-bot:latest
    restart: unless-stopped
    volumes:
      - /etc/localtime:/etc/localtime:ro
    environment:
      # 机器人Token
      - TELEGRAM_BOT_TOKEN=
      # 您的ChatId
      - MY_CHAT_ID=
      # 是否允许编辑消息，0不允许，1允许，如果留空默认不允许
      # - ALLOW_EDIT=0
      # 自动清除消息关系记录，单位：小时，默认720小时（30天）
      # - MESSAGE_CLEAR_HOURS=720
      # 隐藏启动消息，填入1隐藏，留空或者不为1则不隐藏
      # - HIDE_START_MESSAGE=1
      # MongoDB连接配置
      - MONGODB_URL=mongodb://mongodb:27017
      - MONGODB_NAME=hi2chatbot
      # 人机验证配置（可选）
      # - CAPTCHA_ENABLED=1
      # - CAPTCHA_MAX_RETRIES=3
      # - CAPTCHA_FAIL_ACTION=ban
      # - CAPTCHA_TIMEOUT=180
      # AI审核配置（可选）
      # - AI_AUDIT_ENABLED=1
      # - AI_AUDIT_COUNT=1
      # - AI_AUDIT_NOTIFY_USER=0
      # - OPENAI_API_KEY=your_api_key
      # - OPENAI_BASE_URL=https://api.openai.com/v1
      # - OPENAI_MODEL=gpt-3.5-turbo
      # - AI_AUDIT_PROMPT_FILE=/app/ai-audit-prompt.txt
      # 日志文件路径（可选）
      # - LOG_FILE_PATH=/app/logs/chatbot.log
      - TZ=Asia/Hong_Kong
    # 如需自定义AI审核提示词或持久化日志，可以挂载文件/目录
    # volumes:
    #   - ./ai-audit-prompt.txt:/app/ai-audit-prompt.txt:ro
    #   - ./logs:/app/logs
    depends_on:
      - mongodb

  # MongoDB数据库
  mongodb:
    container_name: mongodb
    image: mongo:8
    restart: unless-stopped
    volumes:
      - /etc/localtime:/etc/localtime:ro
      - ./mongo-data:/data/db
    environment:
      - TZ=Asia/Hong_Kong
    # 需要映射端口时取消注释
    # ports:
    #   - "27017:27017"
```

### 方式二：使用 .env 文件配置（推荐）

#### 1. 创建 .env 文件
在 docker-compose.yml 同级目录创建 `.env` 文件（可以从 `env.example` 复制）：

```bash
cp env.example .env
```

然后编辑 `.env` 文件填写配置：

```bash
# 必填配置
TELEGRAM_BOT_TOKEN=your_bot_token_here
MY_CHAT_ID=your_chat_id_here

# MongoDB配置
MONGODB_URL=mongodb://mongodb:27017
MONGODB_NAME=hi2chatbot

# 可选配置
ALLOW_EDIT=0
MESSAGE_CLEAR_HOURS=720
HIDE_START_MESSAGE=0
ENABLE_DC_PING=0
TZ=Asia/Hong_Kong

# 人机验证配置（可选）
CAPTCHA_ENABLED=0
CAPTCHA_MAX_RETRIES=3
CAPTCHA_FAIL_ACTION=ban
CAPTCHA_TIMEOUT=180

# AI审核配置（可选）
AI_AUDIT_ENABLED=1
AI_AUDIT_COUNT=1
AI_AUDIT_NOTIFY_USER=0
OPENAI_API_KEY=your_openai_api_key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-3.5-turbo
AI_AUDIT_PROMPT_FILE=/app/ai-audit-prompt.txt

# 日志配置（可选）
LOG_FILE_PATH=/app/logs/chatbot.log

# Uptime Kuma（可选）
# UPTIME_KUMA_PUSH_URL=https://your-uptime-kuma-url/api/push/xxxxx
```

#### 2. 简化 docker-compose.yml
```yaml
services:
  # 私聊机器人
  hi2ChatBot:
    container_name: hi2-chat-bot
    image: ghcr.io/hi2shark/hi2-chat-bot:latest
    restart: unless-stopped
    env_file:
      - .env
    volumes:
      - /etc/localtime:/etc/localtime:ro
      # 如需自定义AI审核提示词或持久化日志，取消注释
      # - ./ai-audit-prompt.txt:/app/ai-audit-prompt.txt:ro
      # - ./logs:/app/logs
    depends_on:
      - mongodb

  # MongoDB数据库
  mongodb:
    container_name: mongodb
    image: mongo:8
    restart: unless-stopped
    volumes:
      - /etc/localtime:/etc/localtime:ro
      - ./mongo-data:/data/db
    environment:
      - TZ=Asia/Hong_Kong
    # 需要映射端口时取消注释
    # ports:
    #   - "27017:27017"
```

#### 3. 启动服务
```bash
docker-compose up -d
```

## 一键安装脚本
```bash
wget https://raw.githubusercontent.com/hi2shark/hi2-chat-bot/main/install_hi2chatbot.sh && chmod +x install_hi2chatbot.sh && ./install_hi2chatbot.sh
```

## 特色功能简要说明
### 人机验证

- 支持字符验证码（4位数字+字母）和算术题
- 超过重试次数自动拉黑
- 频繁刷新验证码（10次）自动拉黑

### AI审核

基于大模型API的智能广告检测，自动拉黑违规用户。  
支持OpenAI的兼容接口，可以使用DeepSeek、阿里百炼、火星方舟等平台的API，也可以使用自部署的one-api的API中转与管理。  


## 环境变量

| 变量名 | 说明 | 默认值 |
|-------|------|-------|
| `TELEGRAM_BOT_TOKEN` | 机器人的Token，从@BotFather获取 | 无，必填 |
| `MY_CHAT_ID` | 您的用户ID，从@userinfobot获取；也支持设置为群组的chatId | 无，必填 |
| `ALLOW_EDIT` | 是否允许编辑消息 | `0`（不允许） |
| `MESSAGE_CLEAR_HOURS` | 自动清除消息关系记录的时间，单位：小时 | `720`（30天） |
| `HIDE_START_MESSAGE` | 隐藏启动消息，填入1隐藏，留空或者不为1则不隐藏 | 留空 |
| `ENABLE_DC_PING` | 启用DC Ping功能，填入1启用，留空或者不为1则不启用 | 留空 |
| `MONGODB_URL` | MongoDB连接地址 | `mongodb://mongodb:27017` |
| `MONGODB_NAME` | MongoDB数据库名称 | `hi2chatbot` |
| `UPTIME_KUMA_PUSH_URL` | Uptime Kuma推送URL | - |
| `CAPTCHA_ENABLED` | 是否启用人机验证功能，填入1启用 | `0`（不启用） |
| `CAPTCHA_MAX_RETRIES` | 验证码最大重试次数 | `3` |
| `CAPTCHA_FAIL_ACTION` | 验证失败后动作（ban拉黑/block仅禁止） | `ban` |
| `CAPTCHA_TIMEOUT` | 验证码有效期（单位：秒） | `180`（3分钟） |
| `AI_AUDIT_ENABLED` | 是否启用AI审核功能，填入1启用 | `0`（不启用） |
| `AI_AUDIT_COUNT` | 需要审核的消息次数 | `1` |
| `AI_AUDIT_PROMPT_FILE` | AI审核提示词文件路径，为空则使用默认提示词 | 无 |
| `AI_AUDIT_NOTIFY_USER` | 是否通知被AI拉黑的用户，填入1通知 | `0`（不通知） |
| `OPENAI_API_KEY` | OpenAI API密钥，启用AI审核时必填 | 无 |
| `OPENAI_BASE_URL` | OpenAI API基础URL，支持自定义（如使用代理或其他兼容接口） | `https://api.openai.com/v1` |
| `OPENAI_MODEL` | 使用的AI模型名称 | `gpt-3.5-turbo` |
| `LOG_FILE_PATH` | 日志文件路径，为空则只输出到控制台 | 无 |
| `LOG_MAX_SIZE` | 日志文件最大大小（单位：MB），超过后自动轮转 | `10` |
| `TZ` | 时区设置 | `Asia/Hong_Kong` |

```bash
AI_AUDIT_ENABLED=1             # 启用AI审核
AI_AUDIT_COUNT=1               # 审核前N条消息
AI_AUDIT_NOTIFY_USER=0         # 是否通知被拉黑用户
OPENAI_API_KEY=your_key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-3.5-turbo
```

- 新用户前N条消息必须为纯文本（不能包含图片/视频）
- 检测到广告自动拉黑，备注标明"AI自动拉黑-广告"
- 通过审核后可正常发送任何类型消息

### 日志管理

支持日志文件输出和自动轮转。

```bash
LOG_FILE_PATH=/app/logs/chatbot.log  # 日志路径
LOG_MAX_SIZE=10                      # 最大10MB自动轮转
```

## 主要环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `TELEGRAM_BOT_TOKEN` | 机器人Token | 必填 |
| `MY_CHAT_ID` | 管理员ChatID（支持群组） | 必填 |
| `ALLOW_EDIT` | 允许编辑消息 | `0` |
| `MESSAGE_CLEAR_HOURS` | 消息记录清理时间（小时） | `720` |
| `MONGODB_URL` | MongoDB连接地址 | `mongodb://mongodb:27017` |
| `UPTIME_KUMA_PUSH_URL` | Uptime Kuma监控URL | - |

完整环境变量说明见 `.env.example` 文件。

## 使用须知

- 只转发私聊消息，不转发群聊消息
- 转发到群聊需先将机器人拉入群组
- 撤回消息通过 `/del` 指令执行
- 无法撤回或编辑48小时前的消息
- 媒体消息编辑失败时会先删除再重发

## 更新日志

- `2.3.0`：新增人机验证功能  
- `2.2.0`：新增AI审核功能  
- `2.0.0`：升级为数据库版本  
