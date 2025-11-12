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
- **人机验证**：图形验证码验证，防止机器人骚扰（支持字符+算术题）
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

## 更新说明
`2.3.0`：新增人机验证功能，支持图形验证码（字符+算术题）
`2.2.0`：新增AI审核功能，支持自动拉黑违规用户

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

**优势**：
- 配置集中管理，清晰明了
- 敏感信息（Token、API Key）不会暴露在 docker-compose.yml 中
- 可以将 `.env` 加入 `.gitignore`，避免泄露密钥
- 方便切换不同环境配置

## 懒人一键安装脚本
```bash
wget https://raw.githubusercontent.com/hi2shark/hi2-chat-bot/main/install_hi2chatbot.sh && chmod +x install_hi2chatbot.sh && ./install_hi2chatbot.sh
```

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

## 人机验证功能说明

- 人机验证功能可以在新用户首次发送消息时，要求用户完成图形验证码验证，验证通过后才能正常发送消息。
- 验证码支持两种类型：数字字母混合验证码和算术题验证码，随机生成。

### 功能特点
- **图形验证码**：基于 @napi-rs/canvas 生成验证码图片，支持 node:20-alpine 环境
- **双类型验证**：随机生成字符验证码（数字+字母）或算术题验证码
- **重试机制**：支持配置最大重试次数，超过后可选择拉黑或仅禁止发消息
- **有效期控制**：验证码支持自定义有效期，默认3分钟
- **友好提示**：验证失败时提供剩余次数提示，支持重新生成验证码
- **与AI审核协同**：可与AI审核功能同时启用，先验证码验证，再AI审核

### 配置方法
1. 在环境变量中设置 `CAPTCHA_ENABLED=1` 启用功能
2. （可选）配置 `CAPTCHA_MAX_RETRIES` 设置最大重试次数，默认为3次
3. （可选）配置 `CAPTCHA_FAIL_ACTION` 设置失败后动作：
   - `ban`：拉黑用户（默认）
   - `block`：仅禁止发消息，不拉黑
4. （可选）配置 `CAPTCHA_TIMEOUT` 设置验证码有效期（秒），默认180秒（3分钟）

### 使用说明
- 新用户首次发送消息时会自动收到验证码图片，触发验证的消息会被保存
- 用户需要回复验证码答案以完成验证
- 验证码分为两种类型，随机生成：
  - **字符验证码**：4位数字+字母混合，不区分大小写
  - **算术题**：简单的加减乘法，需回复计算结果
- 使用 `/newcaptcha` 指令可以重新获取验证码
  - 第一次刷新：立即生成新验证码
  - 第二次及以后：需要等待10秒
  - 连续刷新10次：自动拉黑（疑似机器人）
- 管理员使用 `/init` 指令可以重置用户的验证和审核状态
- 验证通过后，系统会自动转发触发验证的原始消息，用户可以正常发送消息，如启用AI审核则进入AI审核流程

### 验证流程
1. 新用户发送消息 → 系统保存消息并发送验证码图片
2. 用户回复验证码答案
3. 验证成功 → 自动转发原始消息给管理员 → 用户可正常发送消息（如启用AI审核则继续审核）
4. 验证失败 → 提示剩余次数，可使用 `/newcaptcha` 重新获取
5. 超过最大重试次数 → 根据配置拉黑或禁止发消息
6. 频繁刷新验证码（10次）→ 自动拉黑（疑似机器人）

## AI审核功能说明

- AI审核功能可以自动检测用户发送的消息是否包含广告内容，检测到广告后会自动拉黑用户且不转发消息给机器人所有者。  
- 审核消息次数的说明：对方前N条消息需要AI进行文本审核，**且不能包含媒体信息**，如图片、视频等，通过后可正常转发媒体消息。  

### 功能特点
- **智能检测**：基于OpenAI大语言模型，准确识别广告、推广、诈骗等违规内容
- **自动拉黑**：检测到广告后自动拉黑用户，备注中标明"AI自动拉黑-广告"
- **用户通知**：支持配置是否通知被拉黑的用户，让用户了解被拦截的原因
- **媒体内容限制**：新用户必须先发送纯文本通过审核，才能发送图片、视频等媒体内容
- **灵活配置**：支持自定义审核次数、API地址和模型
- **无感通过**：正常用户的前N条消息通过审核后，后续消息不再审核
- **容错机制**：AI审核失败时不影响正常消息转发

### 配置方法
1. 在环境变量中设置 `AI_AUDIT_ENABLED=1` 启用功能
2. 配置 `OPENAI_API_KEY` 为您的API密钥
3. （可选）配置 `AI_AUDIT_COUNT` 设置审核消息次数，默认为1次
4. （可选）配置 `AI_AUDIT_NOTIFY_USER=1` 启用被拉黑时通知用户，默认不通知
5. （可选）配置 `OPENAI_BASE_URL` 使用自定义API地址
6. （可选）配置 `OPENAI_MODEL` 选择使用的模型
7. （可选）配置 `AI_AUDIT_PROMPT_FILE` 使用自定义提示词文件

### 自定义审核提示词
项目提供了 `ai-audit-prompt.example.txt` 示例文件，您可以：
1. 复制示例文件：`cp ai-audit-prompt.example.txt ai-audit-prompt.txt`
2. 根据需要修改提示词内容
3. 在 Docker Compose 中挂载自定义提示词文件：
```yaml
volumes:
  - ./ai-audit-prompt.txt:/app/ai-audit-prompt.txt:ro
environment:
  - AI_AUDIT_PROMPT_FILE=/app/ai-audit-prompt.txt
```
如果不配置 `AI_AUDIT_PROMPT_FILE` 或文件为空，将使用默认提示词。

### 使用说明
- 新用户发送前N条消息时会自动触发AI审核（N由`AI_AUDIT_COUNT`配置）
- 新用户必须先发送纯文本消息通过审核，不能一上来就发送图片、视频等媒体内容
- 如果新用户发送媒体内容，会收到提示信息，不会转发给机器人所有者
- 通过所有审核的用户后续消息不再审核，可正常发送任何类型的消息
- 使用 `/init` 指令可以重置用户的验证和审核状态
- 使用 `/banlist` 指令可以查看被AI拉黑的用户列表
- 使用 `/test {测试文本}` 指令可以测试AI审核功能是否正常，验证大模型对特定文本的判定结果

## 日志功能说明

机器人支持将日志同时输出到控制台和文件，方便问题追踪和分析。

### 配置方法
在环境变量中设置 `LOG_FILE_PATH` 指定日志文件路径，设置 `LOG_MAX_SIZE` 指定最大日志文件大小：

```yaml
environment:
  - LOG_FILE_PATH=/app/logs/chatbot.log
  - LOG_MAX_SIZE=10  # 单位：MB，默认10MB
volumes:
  - ./logs:/app/logs
```

### 日志轮转
当日志文件大小超过 `LOG_MAX_SIZE` 设置的值时，会自动执行日志轮转：
- 当前日志文件会被重命名为 `.log.1`（旧备份会被删除）
- 创建新的日志文件继续记录
- 控制台会输出轮转提示信息

**示例：**
```
# 原日志文件: chatbot.log (已达到10MB)
# 轮转后:
#   - chatbot.log.1 (旧日志备份)
#   - chatbot.log (新日志文件)
```

### 日志格式
日志文件格式为：`[时间] [级别] 消息内容`

示例：
```
[2025-11-11 10:30:15] [INFO] ✅ AI审核服务已启用，模型: gpt-3.5-turbo, 审核次数: 1
[2025-11-11 10:30:20] [INFO] 🚫 AI检测到广告，已自动拉黑用户 123456 (昵称)
[2025-11-11 10:30:25] [ERROR] AI审核失败: Connection timeout
```

### 日志级别
- `INFO`: 普通信息日志
- `WARN`: 警告信息
- `ERROR`: 错误信息
- `DEBUG`: 调试信息（仅开发环境）

如果不配置 `LOG_FILE_PATH`，日志只会输出到控制台。
