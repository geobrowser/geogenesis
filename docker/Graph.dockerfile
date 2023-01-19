FROM graphprotocol/graph-node:191d797

RUN apt-get update
RUN apt-get install -y -q --fix-missing curl
