import Base from './base.mjs';

class Message extends Base {
  constructor() {
    super('message');
  }

  add(data) {
    const addData = {
      ...data,
      createdAt: new Date(),
    };
    return this.create(addData);
  }

  queryByMessageId(messageId, type = 'forward') {
    return this.findOne({
      messageId,
      type,
    });
  }

  queryByOriginalMessageId(originalMessageId, type = 'forward') {
    return this.findOne({
      originalMessageId,
      type,
    });
  }

  queryByChatId(chatId) {
    return this.find({
      chatId,
      sort: {
        createdAt: -1,
      },
    });
  }
}

export default Message;
