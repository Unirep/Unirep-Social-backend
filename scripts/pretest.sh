#!/bin/sh

MONGO_NAME=unirep_mongo_test
GANACHE_NAME=unirep_ganache_test
TEST_ACCOUNT_1_KEY=0x0000000000000000000000000000000000000000000000000000000000000001

docker stop $MONGO_NAME 2> /dev/null
docker rm $MONGO_NAME 2> /dev/null
docker stop $GANACHE_NAME 2> /dev/null
docker rm $GANACHE_NAME 2> /dev/null

set -e

docker build -f mongo.dockerfile -t unirep_mongo:latest .

docker run -d --name $MONGO_NAME --rm -p 27017:27017 unirep_mongo:latest
docker run -d --name $GANACHE_NAME -p 18545:8545 trufflesuite/ganache-cli:v6.12.2 \
  --account $TEST_ACCOUNT_1_KEY,10000000000000000000000000000 \
  --gasLimit 10000000
