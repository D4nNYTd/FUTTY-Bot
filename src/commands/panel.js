import { ChannelType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { isAdmin } from '../permissions.js';
import { buildVerifyPanelEmbed, buildVerifyPanelRow, buildTicketPanelEmbed, buildTicketPanelRow } from '../tickets.js';

export default {
  data: new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Post verification or ticket panels.')
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName('verify').setDescription('Post the verification panel.')
      .addChannelOption((o) => o.setName('channel').setDescription('Text channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addStringOption((o) => o.setName('help_url').setDescription('Optional help link').setRequired(false)))
    .addSubcommand((sub) => sub.setName('ticket').setDescription('Post the ticket panel.')
      .addChannelOption((o) => o.setName('channel').setDescription('Text channel').addChannelTypes(ChannelType.GuildText).setRequired(true))),
  async execute(interaction) {
    if (!isAdmin(interaction.member, interaction.client.botOwnerId)) {
      return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
    }
    const sub = interaction.options.getSubcommand();
    const channel = interaction.options.getChannel('channel');
    if (sub === 'verify') {
      const helpUrl = interaction.options.getString('help_url');
      await channel.send({ embeds: [buildVerifyPanelEmbed(interaction.guild)], components: [buildVerifyPanelRow(helpUrl)] });
      return interaction.reply({ content: 'Verification panel posted.', flags: MessageFlags.Ephemeral });
    }
    if (sub === 'ticket') {
      await channel.send({ embeds: [buildTicketPanelEmbed(interaction.guild)], components: [buildTicketPanelRow()] });
      return interaction.reply({ content: 'Ticket panel posted.', flags: MessageFlags.Ephemeral });
    }
  }
};
