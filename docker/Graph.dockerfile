FROM graphprotocol/graph-node:40a237b

RUN apt-get update
RUN apt-get install -y -q --fix-missing curl
