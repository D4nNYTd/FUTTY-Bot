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
  const targetName = config.verifiedRole.toLowerCase();
  return guild.roles.cache.find(
    (role) => role.name.toLowerCase() === targetName && !role.managed && role.id !== guild.id
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

  const memberUnverifiedRoles = member.roles.cache.filter(
    (r) => r.name.toLowerCase() === 'unverified' && !r.managed && r.id !== member.guild.id
  );
  if (memberUnverifiedRoles.size > 0) {
    const botMember = member.guild.members.me;
    for (const [, roleToRemove] of memberUnverifiedRoles) {
      if (botMember && roleToRemove.position >= botMember.roles.highest.position) {
        warnings.push(`Unverified role "${roleToRemove.name}" is above my highest role.`);
        continue;
      }
      try { await member.roles.remove(roleToRemove); } catch (err) { warnings.push(`Failed to remove Unverified role: ${err.message}`); }
    }
  }

  if (!role) warnings.push('Verified role not found.');
  else if (member.guild.members.me && role.position >= member.guild.members.me.roles.highest.position) warnings.push('Verified role is above my highest role.');
  else {
    try { await member.roles.add(role); } catch { warnings.push('Failed to assign verified role.'); }

    const duplicateVerifiedRoles = member.roles.cache.filter(
      (r) => r.name.toLowerCase() === config.verifiedRole.toLowerCase() && r.id !== role.id && !r.managed && r.id !== member.guild.id
    );
    for (const [, dupRole] of duplicateVerifiedRoles) {
      try { await member.roles.remove(dupRole); } catch {}
    }
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

export async function verifyMember(member, robloxUser) {
  if (!robloxUser?.sub) throw new Error('Roblox did not return an account id.');
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
