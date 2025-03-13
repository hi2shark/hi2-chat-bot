#!/bin/bash

# 设置颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # 无颜色

# 打印带颜色的消息
print_message() {
  echo -e "${BLUE}[信息]${NC} $1"
}

print_success() {
  echo -e "${GREEN}[成功]${NC} $1"
}

print_warning() {
  echo -e "${YELLOW}[警告]${NC} $1"
}

print_error() {
  echo -e "${RED}[错误]${NC} $1"
}

# 检查命令是否存在
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# 安装Docker
install_docker() {
  print_message "开始安装Docker..."

  if command_exists docker; then
    print_success "Docker已安装，跳过安装步骤。"
    
    # 检查Docker Compose是否已安装
    if command_exists docker compose; then
      print_success "Docker Compose已安装，跳过安装步骤。"
    else
      print_warning "Docker已安装但Docker Compose未安装，尝试安装Docker Compose..."
      # 使用官方脚本重新安装Docker以获取Docker Compose
      print_message "使用官方脚本安装Docker和Docker Compose..."
      curl -fsSL https://get.docker.com | bash -s docker
    fi
    
    return 0
  fi

  # 使用Docker官方安装脚本
  print_message "使用官方脚本安装Docker和Docker Compose..."
  curl -fsSL https://get.docker.com | bash -s docker
  
  # 验证Docker安装
  if command_exists docker; then
    print_success "Docker安装成功！"
  else
    print_error "Docker安装失败，请手动安装。"
    exit 1
  fi
  
  # 验证Docker Compose安装
  if command_exists docker compose; then
    print_success "Docker Compose安装成功！"
  else
    print_warning "Docker Compose未成功安装，尝试手动安装..."
    DOCKER_CONFIG=${DOCKER_CONFIG:-$HOME/.docker}
    mkdir -p $DOCKER_CONFIG/cli-plugins
    curl -SL https://github.com/docker/compose/releases/download/v2.23.0/docker-compose-linux-x86_64 -o $DOCKER_CONFIG/cli-plugins/docker-compose
    chmod +x $DOCKER_CONFIG/cli-plugins/docker-compose
    
    if command_exists docker compose; then
      print_success "Docker Compose手动安装成功！"
    else
      print_error "Docker Compose安装失败，请手动安装。"
      exit 1
    fi
  fi
}

# 获取当前配置
get_current_config() {
  PROJECT_DIR="$HOME/hi2-chat-bot"
  COMPOSE_FILE="$PROJECT_DIR/docker-compose.yml"
  
  if [ -f "$COMPOSE_FILE" ]; then
    CURRENT_BOT_TOKEN=$(grep "TELEGRAM_BOT_TOKEN=" "$COMPOSE_FILE" | cut -d'=' -f2)
    CURRENT_CHAT_ID=$(grep "MY_CHAT_ID=" "$COMPOSE_FILE" | cut -d'=' -f2)
    return 0
  else
    return 1
  fi
}

# 创建项目目录和配置文件
setup_project() {
  print_message "创建项目目录和配置文件..."
  
  # 创建项目目录
  PROJECT_DIR="$HOME/hi2-chat-bot"
  mkdir -p "$PROJECT_DIR"
  
  print_success "创建目录: $PROJECT_DIR"
  
  # 检查是否已经存在配置文件
  COMPOSE_FILE="$PROJECT_DIR/docker-compose.yml"
  OVERWRITE=true
  
  if [ -f "$COMPOSE_FILE" ]; then
    print_warning "检测到已有配置文件！"
    get_current_config
    
    print_message "当前配置:"
    echo "  Telegram Bot Token: ${CURRENT_BOT_TOKEN:-未设置}"
    echo "  Chat ID: ${CURRENT_CHAT_ID:-未设置}"
    
    print_message "是否要修改现有配置? (y/n):"
    read -p "> " MODIFY_CONFIG
    
    if [[ "$MODIFY_CONFIG" != "y" && "$MODIFY_CONFIG" != "Y" ]]; then
      OVERWRITE=false
      print_message "保留现有配置。"
    else
      print_message "将修改现有配置。"
    fi
  fi
  
  if [ "$OVERWRITE" = true ]; then
    # 获取Telegram机器人Token
    print_message "请输入您的Telegram机器人Token (从@BotFather获取):"
    if [ -n "$CURRENT_BOT_TOKEN" ]; then
      print_message "当前值: $CURRENT_BOT_TOKEN"
      print_message "直接按回车保留当前值"
    fi
    read -p "> " BOT_TOKEN
    
    # 如果输入为空且有当前值，则使用当前值
    if [ -z "$BOT_TOKEN" ] && [ -n "$CURRENT_BOT_TOKEN" ]; then
      BOT_TOKEN="$CURRENT_BOT_TOKEN"
      print_message "使用当前值: $BOT_TOKEN"
    fi
    
    # 获取ChatId (可选)
    print_message "请输入您的ChatId (从@userinfobot获取，可以为空，之后通过'/hello'命令获取):"
    if [ -n "$CURRENT_CHAT_ID" ]; then
      print_message "当前值: $CURRENT_CHAT_ID"
      print_message "直接按回车保留当前值"
    fi
    read -p "> " CHAT_ID
    
    # 如果输入为空且有当前值，则使用当前值
    if [ -z "$CHAT_ID" ] && [ -n "$CURRENT_CHAT_ID" ]; then
      CHAT_ID="$CURRENT_CHAT_ID"
      print_message "使用当前值: $CHAT_ID"
    fi
    
    # 创建或覆盖docker-compose.yml文件
    cat > "$PROJECT_DIR/docker-compose.yml" << EOF
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
      - TELEGRAM_BOT_TOKEN=$BOT_TOKEN
      # 您的ChatId
      - MY_CHAT_ID=$CHAT_ID
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
EOF

    print_success "配置文件已创建: $PROJECT_DIR/docker-compose.yml"
  fi
}

# 检查服务状态
check_service_status() {
  PROJECT_DIR="$HOME/hi2-chat-bot"
  
  if [ -d "$PROJECT_DIR" ] && [ -f "$PROJECT_DIR/docker-compose.yml" ]; then
    cd "$PROJECT_DIR"
    
    if docker compose ps 2>/dev/null | grep -q "hi2-chat-bot"; then
      return 0  # 服务正在运行
    else
      return 1  # 服务未运行
    fi
  else
    return 2  # 未安装
  fi
}

# 检查并更新镜像
check_and_update_images() {
  PROJECT_DIR="$HOME/hi2-chat-bot"
  
  if [ -d "$PROJECT_DIR" ] && [ -f "$PROJECT_DIR/docker-compose.yml" ]; then
    cd "$PROJECT_DIR"
    
    print_message "正在检查镜像更新..."
    if docker compose pull; then
      print_success "镜像更新成功！"
      return 0
    else
      print_warning "镜像更新失败，将使用当前镜像。"
      return 1
    fi
  else
    print_warning "项目目录或配置文件不存在，无法更新镜像。"
    return 2
  fi
}

# 启动或重启服务
manage_service() {
  PROJECT_DIR="$HOME/hi2-chat-bot"
  
  check_service_status
  STATUS=$?
  
  if [ $STATUS -eq 0 ]; then
    # 服务正在运行
    print_message "TG私聊机器人服务已在运行。"
    print_message "是否要检查更新并重启服务? (y/n):"
    read -p "> " RESTART_SERVICE
    
    if [[ "$RESTART_SERVICE" == "y" || "$RESTART_SERVICE" == "Y" ]]; then
      # 检查并更新镜像
      check_and_update_images
      UPDATE_STATUS=$?
      
      if [ $UPDATE_STATUS -eq 0 ]; then
        print_message "检测到镜像更新，正在重启服务..."
        cd "$PROJECT_DIR" && docker compose up -d
      else
        print_message "正在重启服务..."
        cd "$PROJECT_DIR" && docker compose restart
      fi
      
      if [ $? -eq 0 ]; then
        print_success "服务重启成功！"
      else
        print_error "服务重启失败，请检查配置和Docker状态。"
      fi
    else
      print_message "保持服务运行状态。"
    fi
  elif [ $STATUS -eq 1 ]; then
    # 服务未运行但已安装
    print_message "TG私聊机器人服务已安装但未运行。"
    print_message "是否要检查更新并启动服务? (y/n):"
    read -p "> " START_SERVICE
    
    if [[ "$START_SERVICE" == "y" || "$START_SERVICE" == "Y" ]]; then
      # 检查并更新镜像
      check_and_update_images
      
      print_message "正在启动服务..."
      cd "$PROJECT_DIR" && docker compose up -d
      
      if [ $? -eq 0 ]; then
        print_success "服务启动成功！"
        if [[ -z "$CHAT_ID" ]]; then
          print_warning "您未设置ChatId，请向机器人发送 /hello 命令获取您的ChatId，然后更新配置文件。"
        fi
      else
        print_error "服务启动失败，请检查配置和Docker状态。"
      fi
    else
      print_message "服务未启动，您可以稍后手动启动:"
      echo "  cd $PROJECT_DIR && docker compose up -d"
    fi
  else
    # 服务未安装
    print_message "是否立即启动服务? (y/n):"
    read -p "> " START_SERVICE
    
    if [[ "$START_SERVICE" == "y" || "$START_SERVICE" == "Y" ]]; then
      print_message "正在启动服务..."
      cd "$PROJECT_DIR" && docker compose up -d
      
      if [ $? -eq 0 ]; then
        print_success "服务启动成功！"
        print_message "您可以使用以下命令管理服务:"
        echo "  - 查看日志: cd $PROJECT_DIR && docker compose logs -f"
        echo "  - 停止服务: cd $PROJECT_DIR && docker compose down"
        echo "  - 重启服务: cd $PROJECT_DIR && docker compose restart"
        
        if [[ -z "$CHAT_ID" ]]; then
          print_warning "您未设置ChatId，请向机器人发送 /hello 命令获取您的ChatId，然后更新配置文件。"
        fi
      else
        print_error "服务启动失败，请检查配置和Docker状态。"
      fi
    else
      print_message "服务未启动，您可以稍后手动启动:"
      echo "  cd $PROJECT_DIR && docker compose up -d"
    fi
  fi
  
  print_message "您可以使用以下命令管理服务:"
  echo "  - 查看日志: cd $PROJECT_DIR && docker compose logs -f"
  echo "  - 停止服务: cd $PROJECT_DIR && docker compose down"
  echo "  - 重启服务: cd $PROJECT_DIR && docker compose restart"
  echo "  - 更新镜像: cd $PROJECT_DIR && docker compose pull"
}

# 主函数
main() {
  print_message "开始安装/配置TG私聊机器人..."
  
  # 安装Docker
  install_docker
  
  # 创建项目目录和配置文件
  setup_project
  
  # 启动或重启服务
  manage_service
  
  print_success "配置过程完成！"
}

# 执行主函数
main 