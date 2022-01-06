FROM node:15-buster

#RUN apt-get update && apt-get install -y libnice-dev libsrtp2-dev valgrind

COPY --chown=node . /home/node/app/

#USER root
#RUN apt-get update -y && apt-get install -y strace

USER node
WORKDIR /home/node/app

RUN npm install

USER root

CMD node /home/node/app/wrtc-test2.js -c config_bob.json
