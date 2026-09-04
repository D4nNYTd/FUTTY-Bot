import { PermissionsBitField } from 'discord.js';
import { admins } from './db.js';

export function isAdmin(member) {
  if (member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return true;
  if (admins.has(member.guild.id, member.id)) return true;
  return member.roles.cache.some((role) => admins.has(member.guild.id, role.id));
}
