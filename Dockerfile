FROM node:15-buster

#RUN apt-get update && apt-get install -y libnice-dev libsrtp2-dev valgrind

COPY --chown=node package.json package-lock.json /home/node/app/

USER node
WORKDIR /home/node/app

RUN npm install

COPY --chown=node . /home/node/app/

USER root

CMD node /home/node/app/wrtc-test2.js -c config_bob.json
