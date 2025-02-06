# Use Node.js LTS as the base image
FROM node:lts AS build


# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy the rest of the application
COPY . .

# Build the React app
RUN npm run build

# Use Node.js for the backend
FROM node:lts

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
COPY server/package.json server/package-lock.json ./server/
RUN npm install

# Copy built frontend and backend code
COPY --from=build /app/build /app/build
COPY server /app/server
COPY api /app/api
COPY agents /app/agents
COPY config /app/config
COPY models /app/models

# Expose only the backend port
EXPOSE 3001

# Start the backend server
CMD ["node", "server/server.js"]