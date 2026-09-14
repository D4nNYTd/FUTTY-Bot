import { ChannelType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { isAdmin } from '../permissions.js';
import { quizConfig } from '../db.js';
import { manualStart, startAutoQuiz, stopAutoQuiz, getStatus } from '../quiz/index.js';

export default {
  data: new SlashCommandBuilder()
    .setName('futtyquiz')
    .setDescription('Manage FUTTY Quiz system.')
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName('channel')
      .setDescription('Set the quiz channel and enable auto mode.')
      .addChannelOption((o) => o.setName('channel').setDescription('Text channel for quiz').addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand((sub) => sub.setName('difficulty')
      .setDescription('Set quiz difficulty.')
      .addStringOption((o) => o.setName('level').setDescription('Difficulty level').setRequired(true)
        .addChoices(
          { name: 'Easy', value: 'Easy' },
          { name: 'Medium', value: 'Medium' },
          { name: 'Hard', value: 'Hard' },
          { name: 'Extreme', value: 'Extreme' },
          { name: 'Random', value: 'Random' }
        )))
    .addSubcommand((sub) => sub.setName('start').setDescription('Manually start a quiz question now.'))
    .addSubcommand((sub) => sub.setName('stop').setDescription('Stop auto quiz mode.'))
    .addSubcommand((sub) => sub.setName('status').setDescription('Show current quiz settings.')),
  async execute(interaction) {
    if (!isAdmin(interaction.member, interaction.client.botOwnerId)) {
      return interaction.reply({ content: 'You do not have permission to manage quiz settings.', flags: MessageFlags.Ephemeral });
    }
    const sub = interaction.options.getSubcommand();
    const current = quizConfig.get(interaction.guildId);

    if (sub === 'channel') {
      const channel = interaction.options.getChannel('channel');
      quizConfig.save(interaction.guildId, channel.id, current?.difficulty || 'Random', true);
      startAutoQuiz(interaction.guildId, interaction.client);
      return interaction.reply({ content: `Quiz channel set to ${channel}. Auto mode enabled.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'difficulty') {
      const level = interaction.options.getString('level');
      quizConfig.save(interaction.guildId, current?.channel_id || null, level, current?.auto_enabled ?? true);
      return interaction.reply({ content: `Quiz difficulty set to **${level}**.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'start') {
      return manualStart(interaction);
    }

    if (sub === 'stop') {
      stopAutoQuiz(interaction.guildId);
      quizConfig.save(interaction.guildId, current?.channel_id || null, current?.difficulty || 'Random', false);
      return interaction.reply({ content: 'Auto quiz mode stopped.', flags: MessageFlags.Ephemeral });
    }

    if (sub === 'status') {
      const status = getStatus(interaction.guildId);
      const lines = [
        `Channel: ${status.channel ? `<#${status.channel}>` : '(not set)'}`,
        `Difficulty: ${status.difficulty}`,
        `Auto mode: ${status.autoEnabled ? 'ON' : 'OFF'}`,
        `Active question: ${status.hasActiveQuestion ? 'Yes' : 'No'}`
      ];
      return interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
    }
  }
};
