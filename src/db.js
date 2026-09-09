import fs from 'node:fs';
import path from 'node:path';
import { Database } from 'bun:sqlite';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
const db = new Database(config.dbPath);
db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA foreign_keys = ON');

db.run(`
  CREATE TABLE IF NOT EXISTS users (
    discord_id TEXT PRIMARY KEY,
    roblox_id TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL,
    display_name TEXT NOT NULL,
    verified_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS guilds (
    guild_id TEXT PRIMARY KEY,
    nick_format TEXT,
    role_id TEXT
  );
  CREATE TABLE IF NOT EXISTS admins (
    guild_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    PRIMARY KEY (guild_id, target_id)
  );
  CREATE TABLE IF NOT EXISTS oauth_states (
    state TEXT PRIMARY KEY,
    discord_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL UNIQUE,
    author_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    claimed_by TEXT,
    created_at INTEGER NOT NULL,
    closed_at INTEGER
  );
`);

db.run(`ALTER TABLE guilds ADD COLUMN ticket_role_id TEXT`);
db.run(`ALTER TABLE guilds ADD COLUMN ticket_category_id TEXT`);
db.run(`ALTER TABLE guilds ADD COLUMN ticket_log_channel_id TEXT`);

const statements = {
  userByDiscord: db.query('SELECT * FROM users WHERE discord_id = ?'),
  userByRoblox: db.query('SELECT * FROM users WHERE roblox_id = ?'),
  saveUser: db.query(`INSERT INTO users (discord_id, roblox_id, username, display_name, verified_at)
    VALUES (@discordId, @robloxId, @username, @displayName, @verifiedAt)
    ON CONFLICT(discord_id) DO UPDATE SET roblox_id = excluded.roblox_id, username = excluded.username,
    display_name = excluded.display_name, verified_at = excluded.verified_at`),
  updateUser: db.query('UPDATE users SET username = ?, display_name = ? WHERE discord_id = ?'),
  guild: db.query('SELECT * FROM guilds WHERE guild_id = ?'),
  saveGuild: db.query(`INSERT INTO guilds (guild_id, nick_format, role_id, ticket_role_id, ticket_category_id, ticket_log_channel_id) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET
      nick_format = COALESCE(excluded.nick_format, guilds.nick_format),
      role_id = COALESCE(excluded.role_id, guilds.role_id),
      ticket_role_id = COALESCE(excluded.ticket_role_id, guilds.ticket_role_id),
      ticket_category_id = COALESCE(excluded.ticket_category_id, guilds.ticket_category_id),
      ticket_log_channel_id = COALESCE(excluded.ticket_log_channel_id, guilds.ticket_log_channel_id)`),
  state: db.query('SELECT * FROM oauth_states WHERE state = ? AND expires_at > ?'),
  saveState: db.query('INSERT INTO oauth_states (state, discord_id, guild_id, expires_at) VALUES (?, ?, ?, ?)'),
  deleteState: db.query('DELETE FROM oauth_states WHERE state = ?'),
  purgeStates: db.query('DELETE FROM oauth_states WHERE expires_at <= ?'),
  admin: db.query('SELECT 1 FROM admins WHERE guild_id = ? AND target_id = ?'),
  addAdmin: db.query('INSERT OR IGNORE INTO admins (guild_id, target_id) VALUES (?, ?)'),
  removeAdmin: db.query('DELETE FROM admins WHERE guild_id = ? AND target_id = ?'),
  admins: db.query('SELECT target_id FROM admins WHERE guild_id = ?')
};

const allUsers = db.query('SELECT * FROM users');

export const users = {
  getByDiscord: (id) => statements.userByDiscord.get(id),
  getByRoblox: (id) => statements.userByRoblox.get(id),
  getAll: () => allUsers.all(),
  save: (user) => statements.saveUser.run(user),
  update: (discordId, username, displayName) => statements.updateUser.run(username, displayName, discordId)
};

const nextTicketNumber = db.query('SELECT COALESCE(MAX(id), 0) + 1 AS num FROM tickets WHERE guild_id = ?');
const createTicket = db.query('INSERT INTO tickets (guild_id, channel_id, author_id, created_at) VALUES (?, ?, ?, ?)');
const ticketByChannel = db.query('SELECT * FROM tickets WHERE channel_id = ?');
const claimTicket = db.query('UPDATE tickets SET status = \'claimed\', claimed_by = ? WHERE channel_id = ? AND status = \'open\'');
const closeTicket = db.query('UPDATE tickets SET status = \'closed\', closed_at = ? WHERE channel_id = ?');

export const guilds = {
  get: (id) => statements.guild.get(id),
  save: (id, nickFormat = null, roleId = null, ticketRoleId = null, ticketCategoryId = null, ticketLogChannelId = null) =>
    statements.saveGuild.run(id, nickFormat, roleId, ticketRoleId, ticketCategoryId, ticketLogChannelId)
};

export const tickets = {
  nextNumber: (guildId) => nextTicketNumber.get(guildId).num,
  create: (guildId, channelId, authorId) => createTicket.run(guildId, channelId, authorId, Date.now()),
  getByChannel: (channelId) => ticketByChannel.get(channelId),
  claim: (channelId, userId) => claimTicket.run(userId, channelId),
  close: (channelId) => closeTicket.run(Date.now(), channelId)
};

export const oauthStates = {
  get: (state) => statements.state.get(state, Date.now()),
  save: (state, discordId, guildId, expiresAt) => statements.saveState.run(state, discordId, guildId, expiresAt),
  consume: (state) => {
    const transaction = db.transaction(() => {
      const entry = statements.state.get(state, Date.now());
      statements.deleteState.run(state);
      return entry;
    });
    return transaction();
  },
  purge: () => statements.purgeStates.run(Date.now())
};

export const admins = {
  has: (guildId, targetId) => Boolean(statements.admin.get(guildId, targetId)),
  add: (guildId, targetId) => statements.addAdmin.run(guildId, targetId),
  remove: (guildId, targetId) => statements.removeAdmin.run(guildId, targetId),
  list: (guildId) => statements.admins.all(guildId).map(({ target_id: targetId }) => targetId)
};
