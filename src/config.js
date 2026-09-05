import 'dotenv/config';

const required = [
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_ID'
];

const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

export const config = {
  discordToken: process.env.DISCORD_TOKEN,
  discordClientId: process.env.DISCORD_CLIENT_ID,
  guildId: process.env.GUILD_ID || null,
  robloxClientId: process.env.ROBLOX_CLIENT_ID || null,
  robloxClientSecret: process.env.ROBLOX_CLIENT_SECRET || null,
  baseUrl: (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  port: Number(process.env.PORT || 3000),
  verifiedRole: process.env.VERIFIED_ROLE || 'Verified',
  nickFormat: process.env.NICK_FORMAT || 'FUTTY | {roblox}',
  dbPath: process.env.DB_PATH || 'data/bot.db'
};

export const robloxConfigured = Boolean(
  config.robloxClientId && config.robloxClientSecret && process.env.BASE_URL
);

export const redirectUri = `${config.baseUrl}/callback`;
