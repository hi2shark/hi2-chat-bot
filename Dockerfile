# Use Node.js 20 as the base image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
COPY server ./server
COPY index.mjs ./index.mjs
COPY import-env.mjs ./import-env.mjs
COPY package.json ./
COPY package-lock.json ./

# Install dependencies
RUN npm install --production

# Define default command
CMD ["npm", "run", "start"]
