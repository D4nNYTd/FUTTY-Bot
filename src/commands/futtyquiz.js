import { ChannelType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { isAdmin } from '../permissions.js';
import { quizConfig } from '../db.js';
import { manualStart, startAutoQuiz, stopAutoQuiz, getStatus } from '../quiz/index.js';

export default {
  data: new SlashCommandBuilder()
    .setName('futtyquiz')
    .setDescription('Manage FUTTY Quiz system.')
    .setDMPermission(false)
    .addSubcommand(function(sub) { return sub.setName('channel').setDescription('Set the quiz channel and enable auto mode.').addChannelOption(function(o) { return o.setName('channel').setDescription('Text channel for quiz').addChannelTypes(ChannelType.GuildText).setRequired(true); }); })
    .addSubcommand(function(sub) { return sub.setName('difficulty').setDescription('Set quiz difficulty.').addStringOption(function(o) { return o.setName('level').setDescription('Difficulty level').setRequired(true).addChoices({ name: 'Easy', value: 'Easy' }, { name: 'Medium', value: 'Medium' }, { name: 'Hard', value: 'Hard' }, { name: 'Extreme', value: 'Extreme' }, { name: 'Random', value: 'Random' }); }); })
    .addSubcommand(function(sub) { return sub.setName('start').setDescription('Manually start a quiz question now.'); })
    .addSubcommand(function(sub) { return sub.setName('stop').setDescription('Stop auto quiz mode.'); })
    .addSubcommand(function(sub) { return sub.setName('status').setDescription('Show current quiz settings.'); }),
  async execute(interaction) {
    if (!isAdmin(interaction.member, interaction.client.botOwnerId)) {
      return interaction.reply({ content: 'You do not have permission to manage quiz settings.', flags: MessageFlags.Ephemeral });
    }
    let sub = interaction.options.getSubcommand();
    let cur = quizConfig.get(interaction.guildId);

    if (sub == 'channel') {
      let ch = interaction.options.getChannel('channel');
      quizConfig.save(interaction.guildId, ch.id, cur ? cur.difficulty : 'Random', true);
      startAutoQuiz(interaction.guildId, interaction.client);
      return interaction.reply({ content: 'Quiz channel set to ' + ch + '. Auto mode enabled.', flags: MessageFlags.Ephemeral });
    }

    if (sub == 'difficulty') {
      let lvl = interaction.options.getString('level');
      quizConfig.save(interaction.guildId, cur ? cur.channel_id : null, lvl, cur ? !!cur.auto_enabled : true);
      return interaction.reply({ content: 'Quiz difficulty set to **' + lvl + '**.', flags: MessageFlags.Ephemeral });
    }

    if (sub == 'start') {
      return manualStart(interaction);
    }

    if (sub == 'stop') {
      stopAutoQuiz(interaction.guildId);
      quizConfig.save(interaction.guildId, cur ? cur.channel_id : null, cur ? cur.difficulty : 'Random', false);
      return interaction.reply({ content: 'Auto quiz mode stopped.', flags: MessageFlags.Ephemeral });
    }

    if (sub == 'status') {
      let st = getStatus(interaction.guildId);
      let lines = [];
      lines.push('Channel: ' + (st.channel ? '<#' + st.channel + '>' : '(not set)'));
      lines.push('Difficulty: ' + st.difficulty);
      lines.push('Auto mode: ' + (st.autoEnabled ? 'ON' : 'OFF'));
      lines.push('Active question: ' + (st.hasActiveQuestion ? 'Yes' : 'No'));
      return interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
    }
  }
};
