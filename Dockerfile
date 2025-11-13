# Use Node.js 20 as the base image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install fonts and dependencies for canvas
# ttf-dejavu: Basic Latin fonts
# fontconfig: Font configuration and customization library
# NOTE: These system packages are required for @napi-rs/canvas to render text
RUN apk add --no-cache \
    fontconfig \
    ttf-dejavu \
    && fc-cache -f

# Copy package files for dependency installation
COPY . ./

# Install dependencies
RUN npm install --production

# Define default command
CMD ["npm", "run", "start"]
