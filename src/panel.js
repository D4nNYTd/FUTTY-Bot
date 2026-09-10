import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

export function buildVerifyPanelEmbed(guild) {
  return new EmbedBuilder()
    .setTitle(`Verification — ${guild.name}`)
    .setThumbnail(guild.iconURL({ size: 128 }) || null)
    .setDescription('Press Verify to link your Roblox account and unlock the server.');
}

export function buildVerifyPanelRow(helpUrl) {
  const buttons = [new ButtonBuilder().setCustomId('verify').setLabel('Verify').setStyle(ButtonStyle.Success)];
  if (helpUrl) buttons.push(new ButtonBuilder().setLabel('Need help?').setStyle(ButtonStyle.Link).setURL(helpUrl));
  return new ActionRowBuilder().addComponents(buttons);
}
