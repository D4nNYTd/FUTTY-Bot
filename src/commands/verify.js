import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { oauthStates } from '../db.js';
import { authorizationUrl } from '../roblox.js';
import { applyVerification } from '../verification.js';

export default {
  data: new SlashCommandBuilder().setName('verify').setDescription('Link your Roblox account.'),
  async execute(interaction) {
    const existing = interaction.client.usersDb.getByDiscord(interaction.user.id);
    if (existing) {
      const result = await applyVerification(interaction.member, { username: existing.username, display_name: existing.display_name });
      const text = result.warnings.length ? `Your verification is active, but ${result.warnings.join(' ')}` : 'Your role and nickname have been updated.';
      return interaction.reply({ content: text, ephemeral: true });
    }

    const state = interaction.client.createState();
    oauthStates.save(state, interaction.user.id, interaction.guildId, Date.now() + 10 * 60 * 1000);
    const embed = new EmbedBuilder().setTitle('Verify your Roblox account').setDescription('Sign in with Roblox to link your account and unlock the server.');
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Sign in with Roblox').setStyle(ButtonStyle.Link).setURL(authorizationUrl(state)));
    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }
};
