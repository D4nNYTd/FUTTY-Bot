import { ChannelType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { admins, guilds } from '../db.js';
import { isAdmin } from '../permissions.js';
import { postPanel } from '../panel.js';

const command = new SlashCommandBuilder().setName('settings').setDescription('Manage verification settings.')
  .addSubcommand((sub) => sub.setName('nick').setDescription('Set the nickname format.').addStringOption((option) => option.setName('format').setDescription('Use {roblox}, {display}, or {discord}.').setRequired(true)))
  .addSubcommand((sub) => sub.setName('role').setDescription('Set the verified role.').addRoleOption((option) => option.setName('role').setDescription('The verified role.').setRequired(true)))
  .addSubcommand((sub) => sub.setName('panel').setDescription('Post the verification panel.').addChannelOption((option) => option.setName('channel').setDescription('A text channel.').addChannelTypes(ChannelType.GuildText).setRequired(true)).addStringOption((option) => option.setName('help_url').setDescription('Optional help link.').setRequired(false)))
  .addSubcommand((sub) => sub.setName('admin').setDescription('Manage settings administrators.').addStringOption((option) => option.setName('action').setDescription('The action.').setRequired(true).addChoices({ name: 'add', value: 'add' }, { name: 'remove', value: 'remove' }, { name: 'list', value: 'list' })).addMentionableOption((option) => option.setName('target').setDescription('A role or member.').setRequired(false)))
  .addSubcommand((sub) => sub.setName('show').setDescription('Show current verification settings.'));

export default {
  data: command,
  async execute(interaction) {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: 'You do not have permission to manage verification settings.', flags: MessageFlags.Ephemeral });
    const subcommand = interaction.options.getSubcommand();
    const current = guilds.get(interaction.guildId);
    if (subcommand === 'nick') {
      const format = interaction.options.getString('format');
      if (!format.includes('{roblox}') && !format.includes('{display}')) return interaction.reply({ content: 'The format must contain {roblox} or {display}.', flags: MessageFlags.Ephemeral });
      guilds.save(interaction.guildId, format, null);
      return interaction.reply({ content: `Nickname format saved. Preview: ${format.replaceAll('{roblox}', 'Builderman').replaceAll('{display}', 'Builder Man').replaceAll('{discord}', interaction.user.username).slice(0, 32)}`, flags: MessageFlags.Ephemeral });
    }
    if (subcommand === 'role') {
      const role = interaction.options.getRole('role');
      guilds.save(interaction.guildId, null, role.id);
      return interaction.reply({ content: `Verified role set to ${role}.`, flags: MessageFlags.Ephemeral });
    }
    if (subcommand === 'panel') {
      await postPanel(interaction.options.getChannel('channel'), interaction.options.getString('help_url'));
      return interaction.reply({ content: 'Verification panel posted.', flags: MessageFlags.Ephemeral });
    }
    if (subcommand === 'show') {
      return interaction.reply({ content: `Nickname format: ${current?.nick_format || interaction.client.config.nickFormat}\nVerified role: ${current?.role_id ? `<@&${current.role_id}>` : interaction.client.config.verifiedRole}`, flags: MessageFlags.Ephemeral });
    }
    const action = interaction.options.getString('action');
    if (action === 'list') return interaction.reply({ content: admins.list(interaction.guildId).map((id) => `<@&${id}> or <@${id}>`).join('\n') || 'No additional administrators configured.', flags: MessageFlags.Ephemeral });
    const target = interaction.options.getMentionable('target');
    if (!target) return interaction.reply({ content: 'Choose a role or member.', flags: MessageFlags.Ephemeral });
    if (action === 'add') admins.add(interaction.guildId, target.id);
    else admins.remove(interaction.guildId, target.id);
    return interaction.reply({ content: `Administrator ${action === 'add' ? 'added' : 'removed'}.`, flags: MessageFlags.Ephemeral });
  }
};
