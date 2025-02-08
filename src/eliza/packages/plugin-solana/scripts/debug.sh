# start agent with the plugin
set -e

# nvm use 23
# pnpm install
# cd src/eliza/packages/plugin-solana

pnpm remove @elizaos/agent || true
pnpm add -D "github:jinbangyi/eliza-agent#master"
# build self
pnpm build

# 5%
export SLIPPAGE=500
# WSOL
export SOL_ADDRESS='So11111111111111111111111111111111111111112'

# mainnet
export SOLANA_RPC_URL='https://api.mainnet-beta.solana.com'

# if you do not have a wallet, you can generate one `node --loader ts-node/esm scripts/generate-keypair.ts`
#
export WALLET_SECRET_KEY='xx'
export SOLANA_PRIVATE_KEY="$WALLET_SECRET_KEY"
export WALLET_PUBLIC_KEY='xx'

# openai apikey
export OPENAI_API_KEY='xx'

# go to https://dashboard.helius.dev/ to get the API key
export HELIUS_API_KEY='xx'
# go to https://bds.birdeye.so/#pricing, at least starter plan
export BIRDEYE_API_KEY='xx'

# fee account
export JUP_SWAP_FEE_ACCOUNT="$WALLET_PUBLIC_KEY"
# 0.5%
export JUP_SWAP_FEE_BPS=50

# this will start the agent
export DISABLE_ADMIN_CHECK=true
node --loader ts-node/esm scripts/debug.ts

# start client
# cd ../../client
# pnpm run dev

# cd ..
# git clone https://github.com/jinbangyi/eliza-client.git
# cd eliza-client
# nvm use 23
# pnpm install
# export SERVER_PORT=8080
# pnpm run dev
