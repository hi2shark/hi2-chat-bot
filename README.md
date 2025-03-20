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
| `/banlist` | 直接发送 | 查看当前黑名单列表 |
| `/del` | 回复 | 撤回消息，别名：`/d`、`/c`、`/cancel`、`/remove` |
| `/ping` | 直接发送 | 检测机器人是否在线 |
| `/dc` | 直接发送 | 检测与Telegram服务器的连接延迟 |
| `/stats` | 回复 | 对转发的用户消息进行指令回复，获取用户聊天统计信息 |
| `/hello` | 直接发送 | 获取当前聊天的ChatId（未配置MY_CHAT_ID时可用） |

## 使用Docker Compose方式部署机器人
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
      - TZ=Asia/Hong_Kong
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
| `MONGODB_URL` | MongoDB连接地址 | `mongodb://mongodb:27017` |
| `MONGODB_NAME` | MongoDB数据库名称 | `hi2chatbot` |
| `UPTIME_KUMA_PUSH_URL` | Uptime Kuma推送URL | - |
| `TZ` | 时区设置 | `Asia/Hong_Kong` |
