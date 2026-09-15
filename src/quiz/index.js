import { EmbedBuilder } from 'discord.js';
import { quizPoints, quizConfig } from '../db.js';
import { questions, points } from './questions.js';

const emoji = '<:futty:1549086955994882108>';
const autoTime = 60 * 60 * 1000;
const delayTime = 30 * 1000;
const quizzes = new Map();

function getQ(diff) {
  let list = diff == 'Random' ? questions : questions.filter(x => x.difficulty == diff);
  if (!list || list.length == 0) list = questions;
  if (!list || list.length == 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}

export function makeEmbed(q, diff) {
  let p = points[diff] || points[q.difficulty];
  return new EmbedBuilder()
    .setTitle(emoji + ' FUTTY Quiz')
    .setDescription('**' + q.question + '**\n\nFirst correct answer wins **' + p + ' FUTTYpoints**.\nDifficulty: ' + (diff == 'Random' ? q.difficulty : diff) + '\nType your answer in this channel.')
    .setColor(0x5865F2)
    .setTimestamp();
}

export function makeWinEmbed(user, ans, p, total) {
  return new EmbedBuilder()
    .setTitle(emoji + ' Correct Answer')
    .setDescription(user + ' answered correctly. The answer was **' + ans + '**.\n\n+' + p + ' FUTTYpoints awarded.\nTotal: **' + total.toLocaleString() + '** FUTTYpoints')
    .setColor(0x57F287)
    .setTimestamp();
}

async function sendQ(guild, chId, diff) {
  let ch = await guild.channels.fetch(chId).catch(() => null);
  if (!ch) return null;
  let q = getQ(diff);
  if (!q) return null;
  let emb = makeEmbed(q, diff);
  let msg = await ch.send({ embeds: [emb] }).catch(() => null);
  if (!msg) return null;
  return { question: q, messageId: msg.id, difficulty: diff == 'Random' ? q.difficulty : diff };
}

function sched(gid, client) {
  let cfg = quizConfig.get(gid);
  if (!cfg || !cfg.auto_enabled || !cfg.channel_id) return;
  let t = setTimeout(async () => {
    try {
      let g = await client.guilds.fetch(gid).catch(() => null);
      if (!g) return;
      let s = await sendQ(g, cfg.channel_id, cfg.difficulty || 'Random');
      if (s) {
        quizzes.set(gid, { timer: null, current: s });
        sched(gid, client);
      }
    } catch (e) {
      console.error('[Quiz] Auto-publish failed for ' + gid + ':', e.message);
    }
  }, autoTime);
  let old = quizzes.get(gid);
  if (old && old.timer) clearTimeout(old.timer);
  quizzes.set(gid, { timer: t, current: old ? old.current : null });
}

export async function startAutoQuiz(gid, client) {
  sched(gid, client);
}

export function stopAutoQuiz(gid) {
  let s = quizzes.get(gid);
  if (s && s.timer) clearTimeout(s.timer);
  quizzes.delete(gid);
}

export async function manualStart(interaction) {
  let cfg = quizConfig.get(interaction.guildId);
  let chId = cfg && cfg.channel_id ? cfg.channel_id : interaction.channelId;
  let diff = cfg && cfg.difficulty ? cfg.difficulty : 'Random';
  let old = quizzes.get(interaction.guildId);
  if (old && old.timer) clearTimeout(old.timer);
  let state = await sendQ(interaction.guild, chId, diff);
  if (!state) return interaction.reply({ content: 'Failed to publish quiz question.', flags: 64 });
  quizzes.set(interaction.guildId, { timer: null, current: state });
  if (cfg && cfg.auto_enabled) sched(interaction.guildId, interaction.client);
  return interaction.reply({ content: 'Quiz question posted in <#' + chId + '>.', flags: 64 });
}

export async function handleMessage(message, client) {
  if (!message.guild || message.author.bot) return;
  let state = quizzes.get(message.guild.id);
  if (!state || !state.current) return;
  let cfg = quizConfig.get(message.guild.id);
  if (cfg && cfg.channel_id && message.channelId != cfg.channel_id) return;
  let txt = message.content.trim().toLowerCase();
  if (!txt) return;
  let curQ = state.current;
  let ok = curQ.question.answer.some(a => a.toLowerCase() == txt);
  if (!ok) return;
  state.current = null;
  let d = curQ.difficulty;
  let p = points[d] || 5;
  let total = quizPoints.add(message.guild.id, message.author.id, p);
  let raw = curQ.question.answer[0];
  let pretty = raw.charAt(0).toUpperCase() + raw.slice(1);
  let emb = makeWinEmbed(message.author.toString(), pretty, p, total);
  await message.channel.send({ embeds: [emb] }).catch(() => {});
  if (cfg && cfg.auto_enabled) {
    let t = setTimeout(async () => {
      try {
        let next = await sendQ(message.guild, cfg.channel_id, cfg.difficulty || 'Random');
        if (next) {
          state.current = next;
          sched(message.guild.id, client);
        }
      } catch (e) {
        console.error('[Quiz] Post-answer publish failed:', e.message);
      }
    }, delayTime);
    if (state.timer) clearTimeout(state.timer);
    state.timer = t;
  }
}

export function getStatus(gid) {
  let cfg = quizConfig.get(gid);
  let s = quizzes.get(gid);
  return {
    channel: cfg ? cfg.channel_id : null,
    difficulty: cfg ? cfg.difficulty : 'Random',
    autoEnabled: cfg ? !!cfg.auto_enabled : false,
    hasActiveQuestion: !!(s && s.current)
  };
}
