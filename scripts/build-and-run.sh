# build, 9Gi
docker build . -t core:localv0.1

docker rm -f core || echo not exists
# start the docker
docker run --rm --name core \
    -v ./scripts/env/.env:/app/.env \
    -v ./scripts/env/.env.agent-eliza:/app/.env.agent-eliza \
    -p 8080:8080 \
    -p 3000:3000 \
    --network core_core_local \
    --add-host=host.docker.internal:host-gateway \
    core:localv0.1

# now you can insert a NFT to the mongodb as a example
