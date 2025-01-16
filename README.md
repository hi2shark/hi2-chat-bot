# TG私聊机器人
简单自用版，将就用，不保证稳定性  
因为是无数据库版本，**所以回复别人的消息需要回复带有`From: xxxxxxxxxx`的信息**，且消息不支持二次编辑（所以你编辑了消息，机器人也不会帮你重发。。。。emmmm）  

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
| `/ping` | 任意 | 查看机器人是否在线，返回了一个ping值，似乎不是很靠谱 |
| `/dc` | 任意 | 机器人与Telegram服务器的Tcping值，参考值 |
