FROM node:20-alpine

WORKDIR /app

# Install deps first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source
COPY . .

# Build CLI
RUN npm run build

# Default entry: run terminator
ENTRYPOINT ["node", "dist/cli.mjs"]
