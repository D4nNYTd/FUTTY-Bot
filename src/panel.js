import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

export async function postPanel(channel, helpUrl) {
  const embed = new EmbedBuilder()
    .setTitle(`Verification — ${channel.guild.name}`)
    .setThumbnail(channel.guild.iconURL({ size: 128 }) || null)
    .setDescription('Press Verify to link your Roblox account and unlock the server.');
  const buttons = [new ButtonBuilder().setCustomId('verify').setLabel('Verify').setStyle(ButtonStyle.Success)];
  if (helpUrl) buttons.push(new ButtonBuilder().setLabel('Need help?').setStyle(ButtonStyle.Link).setURL(helpUrl));
  return channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(buttons)] });
}
