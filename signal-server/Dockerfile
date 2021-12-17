FROM node:17-alpine

USER node

COPY --chown=node package.json package-lock.json /home/node/app/
WORKDIR /home/node/app
RUN npm install

COPY --chown=node index.js /home/node/app/

CMD node index.js
EXPOSE 8080