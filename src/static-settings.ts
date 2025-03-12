// using this apikey to manage the admin settings
export const DELEGATION_MODE =
  (process.env.DELEGATION_MODE || 'false') === 'true';
// not only the nft owner can config the agent
export const CORE_ADMIN_API_KEY: string | undefined =
  process.env.CORE_ADMIN_API_KEY;
