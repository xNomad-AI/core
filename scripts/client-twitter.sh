#!/bin/bash

set -e

VERSION=$1
TARGET_DIR="data/client-twitter"

# check if dir exists
if [ -d "$TARGET_DIR" ]; then
  echo "Directory exists. Updating to $VERSION..."
  cd $TARGET_DIR
  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  git fetch --all
  if [ "$CURRENT_BRANCH" == "$VERSION" ]; then
    git fetch --all
    git pull origin "$VERSION" --rebase
    echo "Latest changes pulled."
  else
    echo "Switching to branch $VERSION..."
    git fetch --all
    echo `pwd`
    git checkout "$VERSION"
    git pull origin "$VERSION"
  fi
else
  git clone https://github.com/xNomad-AI/client-twitter.git $TARGET_DIR
  # git clone https://github.com/jinbangyi/client-twitter.git $TARGET_DIR
  cd $TARGET_DIR
  git checkout "$VERSION"
fi

# Install dependencies and build
pnpm install --no-frozen-lockfile
pnpm run build

echo "client-twitter build done"
