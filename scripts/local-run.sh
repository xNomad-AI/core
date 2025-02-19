set -e
# add env files
cp .env.example scripts/env/.env
cp .env.agent-eliza.example scripts/env/.env.agent-eliza

# start local running env
docker compose up -d

# build, 4Gi
docker build . -t core:localv0.1

# change the mongodb var in .env file
# IP=`docker ps | grep mongo | awk '{ print $1}' | xargs --replace={} docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' {}`
IP="mongodb" # hostname in docker-compose
MONGODB_URL="mongodb://$IP:27017/?directConnection=true&serverSelectionTimeoutMS=2000"
sed -i '/MONGODB_URL/c\MONGODB_URL='"$MONGODB_URL" scripts/env/.env
# check the mongodb url
grep MONGODB_URL scripts/env/.env

docker rm -f core || true
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
