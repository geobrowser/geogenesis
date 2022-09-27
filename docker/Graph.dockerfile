FROM graphprotocol/graph-node:latest

RUN apt-get update
RUN apt-get install -y -q --fix-missing curl
