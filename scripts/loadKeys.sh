#!/bin/sh

mkdir build || true
WORKDIR=$(mktemp -d)
git clone https://github.com/Unirep/circuits.git $WORKDIR
cp -r $WORKDIR/build ./build/keys
