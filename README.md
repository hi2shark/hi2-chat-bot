# TG私聊机器人
简单自用版，将就用，不保证稳定性  
因为是无数据库版本，**所以回复别人的消息需要回复带有`From: xxxxxxxxxx`的信息**，且消息不支持二次编辑（所以你编辑了消息，机器人也不会帮你重发。。。。emmmm）  
**基于数据库的2.0版本正在测试中，欢迎查看 [dev/2.0](https://github.com/hi2shark/hi2-chat-bot/tree/dev/2.0) 分支**  

## 使用前提
你得自己创建机器人，获取Token，然后获取自己的ChatId（一定要给机器人发消息，否则启动会报错）  

## 环境变量
```bash
# 机器人的Token，@BotFather获取
TELEGRAM_BOT_TOKEN=
# 自己的userId就是这个ChatId，@userinfobot获取
MY_CHAT_ID=
# Uptime Kuma的Push地址，非必须
UPTIME_URL=
# Uptime Kuma的Push上报间隔，非必须，单位秒，默认60
UPTIME_INTERVAL=60
```

## 目前支持的指令
| 指令    | 范围    | 说明   | 
| ------  | ------  | ------ |
| `/ban` | 私聊 | 对`From: xxxxxxxxxx`的消息回复`/ban`，即可拉黑这个私聊用户，机器人不再转发他的消息 |
| `/unban` | 私聊 | 对`From: xxxxxxxxxx`的消息回复`/unban`，即可解除拉黑这个私聊用户 |
| `/banlist` | 私聊 | 查看拉黑列表，只记录的userid |
| `/ping` | 任意 | 查看机器人是否在线 |
| `/dc` | 任意 | 机器人与Telegram服务器的Tcping值，参考值 |
| `/del` | 私聊 | 对`MsgId: xxxx - To: xxxxxxxxxx`的消息回复`/del`，即可删除这条你回复的消息 |


## Docker Compose 部署
```yaml
services:
  hi2ChatBot:
    container_name: hi2-chat-bot
    image: ghcr.io/hi2shark/hi2-chat-bot:latest
    restart: unless-stopped
    volumes:
      # 这个目录用来存黑名单列表
      - ./data:/app/data
    environment:
      # 机器人的Token，@BotFather获取
      - TELEGRAM_BOT_TOKEN=
      # 自己的userId就是这个ChatId，@userinfobot获取
      - MY_CHAT_ID=
      # Uptime Kuma的Push地址，非必须
      #- UPTIME_URL=
      # Uptime Kuma的Push上报间隔，非必须，单位秒，默认60
      #- UPTIME_INTERVAL=60
```
