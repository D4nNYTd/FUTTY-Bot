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
  return (roleId && guild.roles.cache.get(roleId)) || guild.roles.cache.find((role) => role.name === config.verifiedRole);
}

export async function applyVerification(member, user) {
  const settings = guilds.get(member.guild.id);
  const format = settings?.nick_format || config.nickFormat;
  const role = findRole(member.guild, settings?.role_id);
  const warnings = [];

  if (!role) warnings.push('The verified role was not found.');
  else if (member.guild.members.me && role.position >= member.guild.members.me.roles.highest.position) warnings.push('I cannot assign the verified role because it is above my highest role.');
  else {
    try { await member.roles.add(role); } catch { warnings.push('I could not assign the verified role.'); }
  }

  const nickname = formatNickname(member, user, format);
  try { await member.setNickname(nickname); } catch { warnings.push('I could not update the nickname.'); }
  return { nickname, warnings };
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
