FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY server ./server
COPY tsconfig.json ./

# Install tsx for running TypeScript
RUN npm install -g tsx

# Expose port
EXPOSE 4000

# Start server
CMD ["tsx", "server/index.ts"]
