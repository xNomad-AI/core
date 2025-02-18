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
# vscode reopen and rebuild in devcontainer

pnpm install

# copy and edit the .env file
cp .env.example .env
# change the apikeys in .env
# https://openai.com/api/
# OPENAI_API_KEY=xx
# https://bds.birdeye.so/
# BIRDEYE_API_KEY=xx
# https://developer.nftgo.io/developers
# NFTGO_API_KEY=xx

pnpm start:local
```

### Start Application on Phala Network

```shell
# start wallet
# your should change the WALLET_SERVICE_SECRET_TOKEN !
docker-compose -f docker-compose-wallet.yml up

# start core
# your should add the required values in .env
cp .env.example .env
cp .env.agent-eliza.example .env.agent-eliza

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
