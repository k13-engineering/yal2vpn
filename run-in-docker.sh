#!/bin/bash

docker build -t yal2vpn . && docker run --cap-add=NET_ADMIN -v /dev/net/tun:/dev/net/tun --network host --rm -it yal2vpn
