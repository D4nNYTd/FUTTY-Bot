import crypto from 'node:crypto';
import { config } from './config.js';
import { guilds, users } from './db.js';

export function createState() {
  return crypto.randomBytes(32).toString('hex');
}

export function formatNickname(member, user, format) {
  return format.replaceAll('{roblox}', user.username).replaceAll('{display}', user.display_name).replaceAll('{discord}', member.user.username).slice(0, 32);
}

function findRole(guild, roleId) {
  if (roleId) {
    const cached = guild.roles.cache.get(roleId);
    if (cached && !cached.managed && cached.id !== guild.id) return cached;
  }
  return guild.roles.cache.find(
    (role) => role.name === config.verifiedRole && !role.managed && role.id !== guild.id
  ) || null;
}

export async function applyVerification(member, user) {
  const settings = guilds.get(member.guild.id);
  const format = settings?.nick_format || config.nickFormat;
  let role = findRole(member.guild, settings?.role_id);
  const warnings = [];

  if (role && (!settings?.role_id || settings.role_id !== role.id)) {
    guilds.save(member.guild.id, null, role.id);
  }

  if (!role) warnings.push('Verified role not found.');
  else if (member.guild.members.me && role.position >= member.guild.members.me.roles.highest.position) warnings.push('Verified role is above my highest role.');
  else {
    try { await member.roles.add(role); } catch { warnings.push('Failed to assign verified role.'); }
  }

  const nickname = formatNickname(member, user, format);
  try {
    await member.setNickname(nickname);
  } catch (err) {
    if (member.id === member.guild.ownerId) warnings.push('Cannot change server owner nickname.');
    else warnings.push('Failed to update nickname.');
  }
  return { nickname, warnings };
}

export async function refreshAllNicknames(guild) {
  const settings = guilds.get(guild.id);
  const format = settings?.nick_format || config.nickFormat;
  const results = { updated: 0, failed: 0, errors: [] };

  for (const [discordId, user] of Object.entries(users.getAllForGuild ? users.getAllForGuild() : {})) {
    try {
      const member = await guild.members.fetch(discordId).catch(() => null);
      if (!member) continue;
      const nickname = formatNickname(member, { username: user.username, display_name: user.display_name }, format);
      await member.setNickname(nickname);
      results.updated++;
    } catch {
      results.failed++;
    }
  }
  return results;
}

export async function verifyMember(member, robloxUser) {
  const existing = users.getByRoblox(String(robloxUser.sub));
  if (existing && existing.discord_id !== member.id) throw new Error('That Roblox account is already linked to another Discord account.');
  const user = {
    discordId: member.id,
    robloxId: String(robloxUser.sub),
    username: robloxUser.preferred_username || robloxUser.name,
    displayName: robloxUser.name || robloxUser.preferred_username,
    verifiedAt: Date.now()
  };
  users.save(user);
  return applyVerification(member, { username: user.username, display_name: user.displayName });
}
