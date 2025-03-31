# core 🤖

The comprehensive core service for running, indexing, and engaging with AI-NFTs is detailed in the [xNomad Documentation](https://docs.xnomad.ai/).

## ✨ Features

- AI-NFT Indexing Service
- AI Agent Runtime Service for AI-NFTs, based on the Eliza Framework
- AI-NFT Launchpad and Marketplace
- Extendable Eliza Capabilities for automated trading, customizable workflows, and comprehensive NFT functionality
- NFT Owner Permission Verification Support
- TEE Environment Compatibility

## ⛓️ Supported Blockchains

- Solana
- EVM (Coming soon)

## 🔐 Secure TEE Configuration

Each NFT agent operates with a TEE-protected private account, ensuring secure and private management of assets corresponding to NFT holders. The TEE environment is powered by **Phala Network**, providing robust protection for sensitive operations.

### Development Environment

For development purposes, you can use docker-compose to launch Phala Docker, providing a simulated TEE environment.

### Production Environment

In production, the core server operates within a Phala Confidential VM, with the TEE environment secured by the Phala Network to ensure robust end-to-end security and compliance for real-world deployments. For more details, refer to the Phala Cloud Documentation.

With this setup, you can confidently manage NFT-related assets in a fully private and secure manner, leveraging the power of TEE to enhance user trust and platform reliability.

## 🚀 Quick Start

### Start Application Locally

```shell
# install nvm
# curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# export NVM_DIR="$HOME/.nvm"
# [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
# nvm install 23.5
# nvm use 23.5
# npm install -g pnpm

# start dependencies
docker compose -f docker-compose-core.yml up -d

pnpm preinstall
pnpm install

# copy and edit the .env file
cp .env.example .env
# change the apikeys in .env
# WALLET_SERVICE_ENDPOINT=http://localhost:8081
# MONGODB_URL=mongodb://localhost:27017/?directConnection=true&serverSelectionTimeoutMS=2000
# OPENAI_API_KEY=..
# BIRDEYE_API_KEY=..
# NFTGO_API_KEY=..

# insert xnomad into mongodb
# use core
# db.collectionConfigs.insertOne({ "id": "d767895962f658681f490b3b7f9ff9de", "chain": "solana" });

# start core service
pnpm start:local
# visit the link to test the agent http://localhost:5173/
# if there not exists an agent, then start one
curl -XPOST 'http://localhost:8080/agent' -d '{ "nftId": "solana:9eVMKfs3X4KoEkf9LZdzFZpSuAyTzh9dvaougZBwJysJ:9eVMKfs3X4KoEkf9LZdzFZpSuAyTzh9dvaougZBwJysJ", "chain": "solana", "restart": true}' -H 'Content-Type: application/json'
```

### Start Application in a remote host with devcontainer

if you start the app in local devcontainer, you should start at `5`.

```bash
# 1. open the vscode and add remote host using remote-explorer
# 2. mkdir and cd to target dir, change the `example` to your name
mkdir example && cd example
# 3. clone code
git clone -b develop https://github.com/xNomad-AI/core.git
#   3.1 multi user in one remote host (docker ps and if there exists a mongodb instance)
#   replace the `$USERNAME` in the .devcontainer/docker-compose.yml to your username
#   in the .devcontainer/devcontainer.json, replace `"service": "core"` -> `"service": "core-$USERNAME"`, $USERNAME is your username
#   in the .devcontainer/devcontainer.json, replace `"docker-compose.yml"` -> `"core-docker-compose.yml"`
# 4. open the devcontainer, windows(ctrl+shift+p) and type `rebuild without cache` and then click the first selection
# 5. set env, change the required apikey [OPENAI_API_KEY, BIRDEYE_API_KEY, NFTGO_API_KEY] in the .env
cp .env.example .env
# 6. install packages
pnpm preinstall && pnpm install
# 7. start app
pnpm start:local
# 8. vscode add portforward, [3000, 8080]
# 9. visit the link agent http://remoteIP:5173/
# 10. if there not exists an agent, then start one
curl -XPOST 'http://localhost:8080/agent' -d '{ "nftId": "you nft id", "chain": "solana", "restart": true}' -H 'Content-Type: application/json'
```

### Start Application on Phala Network

```shell
# start wallet
# your should change the WALLET_SERVICE_SECRET_TOKEN !
docker-compose -f docker-compose-wallet.yml up

# start core
# your should add the required values in .env
cp .env.example .env

docker build --platform linux/amd64 -t YOURORG/core:<YOUR_IMAGE_VERSION> .
docker-compose -f docker-compose-core.yml up
```

## 📜  License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## 📞 Contact

- **Website**: [xnomad.ai](https://xnomad.ai)
- **Twitter**: [@xNomadAI](https://x.com/xNomadAI)

For questions and support, please open an issue in the GitHub repository.

Developed with ❤️ by the xNomad Team.
