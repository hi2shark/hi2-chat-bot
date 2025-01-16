# Use Node.js 20 as the base image
FROM node:20

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./

# Copy server directory and index.js
COPY server/ ./server/
COPY index.js .

# Install dependencies
RUN npm install

# Define default command
CMD ["npm", "run", "pro"]
