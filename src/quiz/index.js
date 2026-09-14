import { EmbedBuilder } from 'discord.js';
import { guilds, quizPoints, quizConfig } from '../db.js';
import { questions, points } from './questions.js';

const FUTTY_EMOJI = '<:futty:1549086955994882108>';
const AUTO_INTERVAL_MS = 60 * 60 * 1000; // 1 hour default
const POST_ANSWER_DELAY_MS = 30 * 1000; // 30 sec after correct answer

const activeQuizzes = new Map(); // guildId -> { timer, currentQuestion }

function pickQuestion(difficulty) {
  const pool = difficulty === 'Random'
    ? questions
    : questions.filter((q) => q.difficulty === difficulty);
  if (pool.length === 0) return questions[Math.floor(Math.random() * questions.length)];
  return pool[Math.floor(Math.random() * pool.length)];
}

export function buildQuizEmbed(question, difficulty) {
  const pts = points[difficulty] || points[question.difficulty];
  return new EmbedBuilder()
    .setTitle(`${FUTTY_EMOJI} FUTTY Quiz`)
    .setDescription(`**${question.question}**\n\nFirst correct answer wins **${pts} FUTTYpoints**.\nDifficulty: ${difficulty === 'Random' ? question.difficulty : difficulty}\nType your answer in this channel.`)
    .setColor(0x5865F2)
    .setTimestamp();
}

export function buildCorrectAnswerEmbed(user, answer, pts, total) {
  return new EmbedBuilder()
    .setTitle(`${FUTTY_EMOJI} Correct Answer`)
    .setDescription(`${user} answered correctly. The answer was **${answer}**.\n\n+${pts} FUTTYpoints awarded.\nTotal: **${total.toLocaleString()}** FUTTYpoints`)
    .setColor(0x57F287)
    .setTimestamp();
}

async function publishQuestion(guild, channelId, difficulty) {
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) return null;
  const q = pickQuestion(difficulty);
  const embed = buildQuizEmbed(q, difficulty);
  const msg = await channel.send({ embeds: [embed] }).catch(() => null);
  if (!msg) return null;
  return { question: q, messageId: msg.id, difficulty: difficulty === 'Random' ? q.difficulty : difficulty };
}

function scheduleNext(guildId, client) {
  const config = quizConfig.get(guildId);
  if (!config?.auto_enabled || !config?.channel_id) return;
  const timer = setTimeout(async () => {
    try {
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) return;
      const state = await publishQuestion(guild, config.channel_id, config.difficulty || 'Random');
      if (state) {
        activeQuizzes.set(guildId, { timer: null, current: state });
        scheduleNext(guildId, client);
      }
    } catch (err) {
      console.error(`[Quiz] Auto-publish failed for ${guildId}:`, err.message);
    }
  }, AUTO_INTERVAL_MS);
  const existing = activeQuizzes.get(guildId);
  if (existing?.timer) clearTimeout(existing.timer);
  activeQuizzes.set(guildId, { timer, current: existing?.current || null });
}

export async function startAutoQuiz(guildId, client) {
  scheduleNext(guildId, client);
}

export function stopAutoQuiz(guildId) {
  const state = activeQuizzes.get(guildId);
  if (state?.timer) clearTimeout(state.timer);
  activeQuizzes.delete(guildId);
}

export async function manualStart(interaction) {
  const config = quizConfig.get(interaction.guildId);
  const channelId = config?.channel_id || interaction.channelId;
  const difficulty = config?.difficulty || 'Random';
  const state = await publishQuestion(interaction.guild, channelId, difficulty);
  if (!state) return interaction.reply({ content: 'Failed to publish quiz question.', flags: 64 });
  const existing = activeQuizzes.get(interaction.guildId);
  if (existing?.timer) clearTimeout(existing.timer);
  activeQuizzes.set(interaction.guildId, { timer: null, current: state });
  // If auto is enabled, reschedule next after this one gets answered or after interval
  if (config?.auto_enabled) scheduleNext(interaction.guildId, interaction.client);
  return interaction.reply({ content: `Quiz question posted in <#${channelId}>.`, flags: 64 });
}

export async function handleMessage(message, client) {
  if (!message.guild || message.author.bot) return;
  const state = activeQuizzes.get(message.guild.id);
  if (!state?.current) return;
  // Only accept answers in the quiz channel
  const config = quizConfig.get(message.guild.id);
  if (config?.channel_id && message.channelId !== config.channel_id) return;
  const normalized = message.content.trim().toLowerCase();
  const correct = state.current.question.answer.some((a) => a.toLowerCase() === normalized);
  if (!correct) return;
  // Correct answer!
  const diff = state.current.difficulty;
  const pts = points[diff] || 5;
  const newTotal = quizPoints.add(message.guild.id, message.author.id, pts);
  const displayAnswer = state.current.question.answer[0];
  // Capitalize first letter for display
  const prettyAnswer = displayAnswer.charAt(0).toUpperCase() + displayAnswer.slice(1);
  const embed = buildCorrectAnswerEmbed(message.author.toString(), prettyAnswer, pts, newTotal);
  await message.channel.send({ embeds: [embed] }).catch(() => {});
  // Clear current question
  state.current = null;
  // Schedule next question after delay if auto is on
  if (config?.auto_enabled) {
    const timer = setTimeout(async () => {
      try {
        const nextState = await publishQuestion(message.guild, config.channel_id, config.difficulty || 'Random');
        if (nextState) {
          state.current = nextState;
          scheduleNext(message.guild.id, client);
        }
      } catch (err) {
        console.error(`[Quiz] Post-answer publish failed:`, err.message);
      }
    }, POST_ANSWER_DELAY_MS);
    if (state.timer) clearTimeout(state.timer);
    state.timer = timer;
  }
}

export function getStatus(guildId) {
  const config = quizConfig.get(guildId);
  const state = activeQuizzes.get(guildId);
  return {
    channel: config?.channel_id || null,
    difficulty: config?.difficulty || 'Random',
    autoEnabled: config?.auto_enabled ?? false,
    hasActiveQuestion: !!state?.current
  };
}
