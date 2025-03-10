# TG私聊机器人
2.0升级为数据库版本，精简机器人消息窗口，增加消息撤回功能；  

## 使用须知
 - 机器人只会转发私聊信息给`MY_CHAT_ID`，不会转发群聊信息，所以拉入群聊以后不会转发消息；  
 - 由于接口限制，机器人无法主动监听消息被删除了，如果你需要撤回消息，只能通过对已发送消息执行`/del`指令撤回；  
 - 机器人无法撤回48小时前的消息，使用前请注意；  
 - 机器人无法编辑48小时前的消息，使用前请注意；  
 - 由于媒体类消息的特性，机器人大概率会编辑失败，因此会先删除旧消息，再发送新消息；  

## 使用前提
你得自己创建机器人，获取Token，然后获取自己的ChatId  
如果你无法获取，可以只指定`TELEGRAM_BOT_TOKEN`，`MY_CHAT_ID`留空，你发送`/hello`指令，机器人会告诉你当前的ChatId；  

## 环境变量
```bash
# 机器人的Token，@BotFather获取
TELEGRAM_BOT_TOKEN=
# 自己的userId就是这个ChatId，@userinfobot获取
MY_CHAT_ID=
```
*UptimeKuma上报经常异常，所以删掉了*  


## 目前支持的指令
| 指令    | 范围    | 说明   | 
| ------  | ------  | ------ |
| `/ban` | 回复/带命令 | 对消息回复`/ban`，即可拉黑这个私聊用户，机器人不再转发他的消息；`/ban {remark}`，拉黑并备注 |
| `/unban` | 回复/带命令 | 发送`/unban {userId}`，即可解除拉黑状态 |
| `/del` | 回复 | 对消息回复`/del`，即可撤回消息，`/d`，`/c`，`/cancel`，`/remove`可以通用 |
| `/banlist` | - | 查看拉黑列表，只记录的userid、nickname、remark、时间 |
| `/dc` | - | 机器人与Telegram服务器的Tcping值，参考值 |
| `/ping` | - | 查看机器人是否在线 |
| `/hello` | 任意 | 只在没有配置MY_CHAT_ID时，可获取当前聊天渠道的ChatId |

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
```
