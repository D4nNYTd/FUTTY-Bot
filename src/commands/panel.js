import { ChannelType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { isAdmin } from '../permissions.js';
import { buildVerifyPanelEmbed, buildVerifyPanelRow } from '../panel.js';

export default {
  data: new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Post the verification panel.')
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName('verify').setDescription('Post the verification panel.')
      .addChannelOption((o) => o.setName('channel').setDescription('Text channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addStringOption((o) => o.setName('help_url').setDescription('Optional help link').setRequired(false))),
  async execute(interaction) {
    if (!isAdmin(interaction.member, interaction.client.botOwnerId)) {
      return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
    }
    const channel = interaction.options.getChannel('channel');
    const helpUrl = interaction.options.getString('help_url');
    await channel.send({ embeds: [buildVerifyPanelEmbed(interaction.guild)], components: [buildVerifyPanelRow(helpUrl)] });
    return interaction.reply({ content: 'Verification panel posted.', flags: MessageFlags.Ephemeral });
  }
};
