// using this apikey to manage the admin settings
export const DISABLE_NFT_ADMIN_CHECK =
  (process.env.DISABLE_NFT_ADMIN_CHECK || 'false') === 'true';
// disable the auth for the api server
export const DISABLE_API_SERVER_AUTH = (process.env.DISABLE_API_SERVER_AUTH || 'false') === 'true';

// not only the nft owner can config the agent
// export const CORE_ADMIN_API_KEY: string | undefined =
//   process.env.CORE_ADMIN_API_KEY;

export const CORE_SERVER_PORT = process.env.CORE_SERVER_PORT || 8080;
