# Use Node.js 20 as the base image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
COPY . ./

# Install dependencies
RUN npm install --production

# Define default command
CMD ["npm", "run", "start"]
