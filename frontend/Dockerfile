# Use an official Node.js runtime as a parent image
FROM node:22-alpine

# Set the working directory in the container
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package.json and pnpm-lock.yaml for caching
COPY package.json pnpm-lock.yaml ./

# Install dependencies (only for dev/install)
RUN pnpm install

# Copy the rest of the application code
COPY . .

# Expose Next.js default port
EXPOSE 3000

# Start the application in development mode
CMD ["pnpm", "dev"]