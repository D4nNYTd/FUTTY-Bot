import { admins } from './db.js';

export function isAdmin(member, botOwnerId) {
  if (botOwnerId && member.id === botOwnerId) return true;
  if (admins.has(member.guild.id, member.id)) return true;
  return member.roles.cache.some((role) => admins.has(member.guild.id, role.id));
}
