import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { oauthStates, users } from '../db.js';
import { authorizationUrl } from '../roblox.js';
import { applyVerification } from '../verification.js';
import { robloxConfigured } from '../config.js';

export default {
  data: new SlashCommandBuilder().setName('verify').setDescription('Link your Roblox account.').setDMPermission(false),
  async execute(interaction) {
    if (!robloxConfigured) return interaction.reply({ content: 'Roblox verification is not configured yet.', flags: MessageFlags.Ephemeral });
    const existing = users.getByDiscord(interaction.user.id);
    if (existing) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const result = await applyVerification(interaction.member, { username: existing.username, display_name: existing.display_name });
      const text = result.warnings.length ? `Your verification is active, but ${result.warnings.join(' ')}` : 'Your role and nickname have been updated.';
      return interaction.editReply({ content: text });
    }

    const state = interaction.client.createState();
    oauthStates.save(state, interaction.user.id, interaction.guildId, Date.now() + 10 * 60 * 1000);
    const embed = new EmbedBuilder().setTitle('Verify your Roblox account').setDescription('Sign in with Roblox to link your account and unlock the server.');
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Sign in with Roblox').setStyle(ButtonStyle.Link).setURL(authorizationUrl(state)));
    return interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
  }
};
