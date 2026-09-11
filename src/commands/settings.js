import { ChannelType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { admins, guilds, ticketRoles, users } from '../db.js';
import { isAdmin } from '../permissions.js';
import { formatNickname } from '../verification.js';

const command = new SlashCommandBuilder().setName('settings').setDescription('Manage verification settings.')
  .addSubcommand((sub) => sub.setName('nick').setDescription('Set the nickname format.').addStringOption((option) => option.setName('format').setDescription('Use {roblox}, {display}, or {discord}.').setRequired(true)))
  .addSubcommand((sub) => sub.setName('role').setDescription('Set the verified role.').addRoleOption((option) => option.setName('role').setDescription('The verified role.').setRequired(true)))
  .addSubcommand((sub) => sub.setName('admin').setDescription('Manage settings administrators.').addStringOption((option) => option.setName('action').setDescription('The action.').setRequired(true).addChoices({ name: 'add', value: 'add' }, { name: 'remove', value: 'remove' }, { name: 'list', value: 'list' })).addMentionableOption((option) => option.setName('target').setDescription('A role or member.').setRequired(false)))
  .addSubcommand((sub) => sub.setName('show').setDescription('Show current verification settings.'))
  .addSubcommandGroup((group) => group.setName('ticket').setDescription('Manage ticket settings.')
    .addSubcommand((sub) => sub.setName('role').setDescription('Add or remove a support role for tickets.').addStringOption((o) => o.setName('action').setDescription('Action').setRequired(true).addChoices({ name: 'add', value: 'add' }, { name: 'remove', value: 'remove' }, { name: 'list', value: 'list' })).addRoleOption((o) => o.setName('role').setDescription('Support role').setRequired(false)))
    .addSubcommand((sub) => sub.setName('category').setDescription('Set the ticket category.').addChannelOption((o) => o.setName('category').setDescription('Category').addChannelTypes(ChannelType.GuildCategory).setRequired(true)))
    .addSubcommand((sub) => sub.setName('log').setDescription('Set the ticket log channel.').addChannelOption((o) => o.setName('channel').setDescription('Log channel').addChannelTypes(ChannelType.GuildText).setRequired(true))));

export default {
  data: command.setDMPermission(false),
  async execute(interaction) {
    if (!isAdmin(interaction.member, interaction.client.botOwnerId)) return interaction.reply({ content: 'You do not have permission to manage verification settings.', flags: MessageFlags.Ephemeral });
    const subcommand = interaction.options.getSubcommand();
    const current = guilds.get(interaction.guildId);
    if (subcommand === 'nick') {
      const format = interaction.options.getString('format');
      if (!format.includes('{roblox}') && !format.includes('{display}')) return interaction.reply({ content: 'The format must contain {roblox} or {display}.', flags: MessageFlags.Ephemeral });
      guilds.save(interaction.guildId, format, null);
      const preview = format.replaceAll('{roblox}', 'Builderman').replaceAll('{display}', 'Builder Man').replaceAll('{discord}', interaction.user.username).slice(0, 32);
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      let updated = 0;
      let failed = 0;
      const allUsers = users.getAll();
      for (const user of allUsers) {
        try {
          const member = await interaction.guild.members.fetch(user.discord_id).catch(() => null);
          if (!member) continue;
          const nickname = formatNickname(member, { username: user.username, display_name: user.display_name }, format);
          await member.setNickname(nickname);
          updated++;
        } catch {
          failed++;
        }
      }
      return interaction.editReply({ content: `Nickname format saved. Preview: ${preview}\nUpdated ${updated} members. ${failed > 0 ? `${failed} failed.` : ''}` });
    }
    if (subcommand === 'role') {
      const role = interaction.options.getRole('role');
      if (!role) return interaction.reply({ content: 'Please specify a role.', flags: MessageFlags.Ephemeral });
      guilds.save(interaction.guildId, null, role.id);
      return interaction.reply({ content: `Verified role set to ${role}.`, flags: MessageFlags.Ephemeral });
    }

    if (subcommand === 'show') {
      const lines = [
        `Nickname format: ${current?.nick_format || interaction.client.config.nickFormat}`,
        `Verified role: ${current?.role_id ? `<@&${current.role_id}>` : '(not set — use /settings role)'}`,
        `Ticket roles: ${ticketRoles.list(interaction.guildId).map((id) => `<@&${id}>`).join(', ') || '(none)'}`,
        `Ticket category: ${current?.ticket_category_id ? `<#${current.ticket_category_id}>` : '(not set)'}`,
        `Ticket log: ${current?.ticket_log_channel_id ? `<#${current.ticket_log_channel_id}>` : '(not set)'}`
      ];
      return interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
    }
    const subcommandGroup = interaction.options.getSubcommandGroup();
    if (subcommandGroup === 'ticket') {
      const ticketSub = interaction.options.getSubcommand();
      if (ticketSub === 'role') {
        const action = interaction.options.getString('action');
        if (action === 'list') {
          const roles = ticketRoles.list(interaction.guildId);
          return interaction.reply({ content: roles.length ? `Ticket support roles: ${roles.map((id) => `<@&${id}>`).join(', ')}` : 'No ticket support roles configured.', flags: MessageFlags.Ephemeral });
        }
        const role = interaction.options.getRole('role');
        if (!role) return interaction.reply({ content: 'Specify a role for add/remove.', flags: MessageFlags.Ephemeral });
        if (action === 'add') {
          if (role.managed) return interaction.reply({ content: 'Cannot add a managed role.', flags: MessageFlags.Ephemeral });
          ticketRoles.add(interaction.guildId, role.id);
          return interaction.reply({ content: `Added ${role} as ticket support role.`, flags: MessageFlags.Ephemeral });
        }
        ticketRoles.remove(interaction.guildId, role.id);
        return interaction.reply({ content: `Removed ${role} from ticket support roles.`, flags: MessageFlags.Ephemeral });
      }
      if (ticketSub === 'category') {
        const cat = interaction.options.getChannel('category');
        guilds.save(interaction.guildId, null, null, cat.id);
        return interaction.reply({ content: `Ticket category set to ${cat}.`, flags: MessageFlags.Ephemeral });
      }
      if (ticketSub === 'log') {
        const ch = interaction.options.getChannel('channel');
        guilds.save(interaction.guildId, null, null, null, ch.id);
        return interaction.reply({ content: `Ticket log channel set to ${ch}.`, flags: MessageFlags.Ephemeral });
      }
    }
    const action = interaction.options.getString('action');
    if (action === 'list') return interaction.reply({ content: admins.list(interaction.guildId).map((id) => `<@&${id}> or <@${id}>`).join('\n') || 'No additional administrators configured.', flags: MessageFlags.Ephemeral });
    const target = interaction.options.getMentionable('target');
    if (!target) return interaction.reply({ content: 'Choose a role or member.', flags: MessageFlags.Ephemeral });
    if (action === 'add') {
      if ('id' in target && target.id === interaction.guild.id) return interaction.reply({ content: 'Cannot add @everyone as administrator.', flags: MessageFlags.Ephemeral });
      if ('managed' in target && target.managed) return interaction.reply({ content: 'Cannot add a managed role as administrator.', flags: MessageFlags.Ephemeral });
      admins.add(interaction.guildId, target.id);
    } else {
      admins.remove(interaction.guildId, target.id);
    }
    return interaction.reply({ content: `Administrator ${action === 'add' ? 'added' : 'removed'}.`, flags: MessageFlags.Ephemeral });
  }
};
