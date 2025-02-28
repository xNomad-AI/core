#!/bin/bash

set -e

VERSION=$1

TARGET_DIR="data/eliza"
# check if dir exists
if [ -d "$TARGET_DIR" ]; then
  git fetch --all
  git checkout $VERSION
  echo "exists"
else
  git clone -b $VERSION https://github.com/xNomad-AI/eliza.git $TARGET_DIR
fi

cd $TARGET_DIR
git pull
pnpm run clean || true

node --version
pnpm install --no-frozen-lockfile
pnpm run build
# pnpm run build --filter=@elizaos/core
# pnpm run build --filter=@elizaos/client-direct
# pnpm run build --filter=@elizaos/plugin-tee
# pnpm run build --filter=@elizaos/client-telegram
# pnpm run build --filter=@elizaos/adapter-mongodb

echo elizaos build done
