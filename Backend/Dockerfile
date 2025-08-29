
FROM node:18
# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the container
COPY package*.json ./

# Install app dependencies
RUN npm install

# Copy the rest of your backend source code
COPY . .

# IMPORTANT: Expose the port your app will run on
# Railway provides a PORT environment variable, so your app must listen on that.
# This line just documents it; your code must actually use process.env.PORT.
EXPOSE 8000

# Define the command to run your app
CMD [ "npm", "start" ]