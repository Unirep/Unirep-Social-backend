#!/bin/sh

# build docker images for backend and frontend and start a
# docker-compose with frontend, backend, mongo, ganache

# should be able to access unirep social webpage as usual

set -e

ORIGDIR=$(pwd)
# get a temporary directory to build the frontend docker image
WORKDIR=$(mktemp)

cd $WORKDIR
git clone git@github.com:Unirep/Unirep-Social-frontend.git
cd unirep-social-frontend
docker build . -t unirep_social_frontend
