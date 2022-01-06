FROM node:15-buster

#RUN apt-get update && apt-get install -y libnice-dev libsrtp2-dev valgrind

COPY --chown=node . /home/node/app/

USER node
WORKDIR /home/node/app

RUN npm install

USER root
CMD npm start
