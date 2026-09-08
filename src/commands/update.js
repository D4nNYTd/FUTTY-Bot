import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { users } from '../db.js';
import { getUser } from '../roblox.js';
import { applyVerification } from '../verification.js';
import { isAdmin } from '../permissions.js';

export default {
  data: new SlashCommandBuilder().setName('update').setDescription('Update your Roblox username and nickname.').addUserOption((option) => option.setName('user').setDescription('A user to update').setRequired(false)),
  async execute(interaction) {
    const target = interaction.options.getMember('user') || interaction.member;
    if (target.id !== interaction.user.id && !isAdmin(interaction.member)) return interaction.reply({ content: 'You do not have permission to update another user.', flags: MessageFlags.Ephemeral });
    const linked = users.getByDiscord(target.id);
    if (!linked) return interaction.reply({ content: 'That user is not verified.', flags: MessageFlags.Ephemeral });
    const profile = await getUser(linked.roblox_id);
    const username = profile.name || profile.userName || linked.username;
    const displayName = profile.displayName || profile.name || linked.display_name;
    users.update(target.id, username, displayName);
    const result = await applyVerification(target, { username, display_name: displayName });
    const warningText = result.warnings.length ? ` ${result.warnings.join(' ')}` : '';
    return interaction.reply({ content: `Updated ${target.user.username}'s Roblox data and nickname.${warningText}`, flags: MessageFlags.Ephemeral });
  }
};
