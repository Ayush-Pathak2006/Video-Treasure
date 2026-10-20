FROM node:22-alpine

# Set the working directory inside the container
WORKDIR /usr/src/app

# Install production dependencies from the lockfile first, so this layer is cached between code changes.
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the rest of the backend source code (.dockerignore keeps node_modules and .env out)
COPY . .

# The API listens on PORT (8000 by default). The same image runs the worker with `node src/worker.js`
# (see deploy/docker-compose.yml).
EXPOSE 8000

# node directly rather than npm start, so `docker stop` signals reach the app.
CMD [ "node", "src/index.js" ]
