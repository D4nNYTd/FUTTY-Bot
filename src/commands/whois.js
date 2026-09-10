import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { users } from '../db.js';
import { getHeadshot, getUser } from '../roblox.js';

export default {
  data: new SlashCommandBuilder().setName('whois').setDescription('Show a member\'s linked Roblox account.').setDMPermission(false).addUserOption((option) => option.setName('user').setDescription('The member to look up').setRequired(false)),
  async execute(interaction) {
    const userOption = interaction.options.getUser('user');
    let member;
    if (userOption) {
      member = interaction.guild.members.cache.get(userOption.id) ?? null;
      if (!member) return interaction.reply({ content: 'That user is not on this server.', flags: MessageFlags.Ephemeral });
    } else {
      member = interaction.member;
    }
    const linked = users.getByDiscord(member.id);
    if (!linked) return interaction.reply({ content: 'That user is not verified.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply();
    const [profile, headshot] = await Promise.all([getUser(linked.roblox_id), getHeadshot(linked.roblox_id)]);
    const created = new Date(profile.created).toLocaleDateString('en-US', { dateStyle: 'long' });
    const verified = new Date(linked.verified_at).toLocaleDateString('en-US', { dateStyle: 'long' });
    const image = headshot.data?.[0]?.imageUrl;
    const embed = new EmbedBuilder().setTitle(`${profile.displayName} (@${profile.name})`).addFields(
      { name: 'Roblox ID', value: linked.roblox_id, inline: true },
      { name: 'Account created', value: created, inline: true },
      { name: 'Verified', value: verified, inline: true }
    ).setURL(`https://www.roblox.com/users/${encodeURIComponent(linked.roblox_id)}/profile`);
    if (image) embed.setThumbnail(image);
    return interaction.editReply({ embeds: [embed] });
  }
};
