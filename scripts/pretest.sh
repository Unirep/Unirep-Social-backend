#!/bin/sh

MONGO_NAME=unirep_mongo_test
GANACHE_NAME=unirep_ganache_test
TEST_ACCOUNT_1_KEY=0x0000000000000000000000000000000000000000000000000000000000000001
TEST_ACCOUNT_2_KEY=0x0000000000000000000000000000000000000000000000000000000000000002

docker stop $MONGO_NAME 2> /dev/null
docker rm $MONGO_NAME 2> /dev/null
docker stop $GANACHE_NAME 2> /dev/null
docker rm $GANACHE_NAME 2> /dev/null

set -e

docker run -d --name $MONGO_NAME --rm -p 27017:27017 mongo:4.4
docker run -d --name $GANACHE_NAME -p 8545:8545 -p 8546:8546 trufflesuite/ganache-cli:v6.12.2 \
  --account $TEST_ACCOUNT_1_KEY,10000000000000000000000000000 \
  --account $TEST_ACCOUNT_2_KEY,10000000000000000000000000000 \
  --gasLimit 10000000