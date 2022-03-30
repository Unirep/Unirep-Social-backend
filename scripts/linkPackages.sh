#!/bin/bash -xe

cd "$(dirname "$0")"
cd ..
mkdir -p build
cd build

# clone Unirep monorepo
UNIREP="Unirep/"
if [ -d "$UNIREP" ]; then
    echo "Skip git clone unirep repository"
else
    git clone https://github.com/Unirep/Unirep.git
    cd Unirep
    git reset 33b917bfbe796a5001ef9b039205e57daaf37d47 --hard
    yarn install && yarn build
    cd packages
    # link all packages
    for directory in *
    do
        cd ${directory}
        yarn link
        cd ../../../..
        yarn link "@unirep/${directory}"
        cd build/Unirep/packages
    done
    cd ../..
fi

# clone Unirep-Social repo
UNIREP_SOCIAL="Unirep-Social/"
if [ -d "$UNIREP_SOCIAL" ]; then
    echo "Skip git clone unirep social repository"
else
    git clone https://github.com/Unirep/Unirep-Social.git
    cd Unirep-Social
    git reset 2d63c0b94ac966fa26136e388c8de2bfc6bec7b8 --hard
    yarn install
    yarn build
    yarn link
    cd ..
    yarn link "unirep-social"
fi