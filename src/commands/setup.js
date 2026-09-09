import { MessageFlags, PermissionsBitField, SlashCommandBuilder } from 'discord.js';
import { config } from '../config.js';
import { isAdmin } from '../permissions.js';

const REQUIRED_PERMISSIONS = [
  PermissionsBitField.Flags.ManageChannels,
  PermissionsBitField.Flags.ManageRoles,
  PermissionsBitField.Flags.ManageNicknames,
  PermissionsBitField.Flags.ViewChannel,
  PermissionsBitField.Flags.SendMessages,
  PermissionsBitField.Flags.ReadMessageHistory
];

export default {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Check bot permissions and generate invite link.'),
  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: 'You do not have permission to run this command.', flags: MessageFlags.Ephemeral });
    }

    const me = interaction.guild.members.me;
    const missing = REQUIRED_PERMISSIONS.filter((perm) => !me.permissions.has(perm));
    const lines = [];

    if (missing.length === 0) {
      lines.push('All required permissions are granted.');
    } else {
      lines.push(`Missing permissions: ${missing.map((p) => p.toString()).join(', ')}`);
    }

    const verifiedRole = interaction.guild.roles.cache.find(
      (r) => r.name === config.verifiedRole && !r.managed && r.id !== interaction.guild.id
    );
    if (verifiedRole) {
      lines.push(`Verified role found: ${verifiedRole}`);
    } else {
      lines.push(`Verified role "${config.verifiedRole}" not found. Create it or set via /settings role.`);
    }

    const permsBit = REQUIRED_PERMISSIONS.reduce((acc, p) => acc | p, 0n);
    const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${config.discordClientId}&scope=bot%20applications.commands&permissions=${permsBit}`;
    lines.push('', 'Invite link with required permissions:', inviteUrl);

    return interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
  }
};
