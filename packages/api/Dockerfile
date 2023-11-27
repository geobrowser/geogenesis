FROM node:alpine
LABEL description="Instant high-performance GraphQL API for your PostgreSQL database https://github.com/graphile/postgraphile"

# Set Node.js app folder
RUN mkdir -p /home/node/app/node_modules
WORKDIR /home/node/app

# Copy dependencies
COPY ./package*.json .
RUN chown -R node:node /home/node/app

# Install dependencies
USER node
RUN npm install

# Copy application files
COPY --chown=node:node ./src .

EXPOSE 8080
CMD [ "node", "server.js" ]