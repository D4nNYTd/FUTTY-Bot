import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { guilds, ticketRoles, tickets, users } from './db.js';
import { isAdmin } from './permissions.js';

const COOLDOWN_MS = 10 * 60 * 1000;

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

export function buildTicketPanelEmbed(guild) {
  return new EmbedBuilder()
    .setTitle(`Support Tickets — ${guild.name}`)
    .setDescription('Press the button below to create a support ticket.\nOnly one open ticket per user. 10-minute cooldown between tickets.')
    .setColor(0x5865F2);
}

export function buildTicketPanelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:create').setLabel('Create ticket').setStyle(ButtonStyle.Success)
  );
}

function hasTicketAccess(member, botOwnerId) {
  const roles = ticketRoles.list(member.guild.id);
  if (roles.some((roleId) => member.roles.cache.has(roleId))) return true;
  return isAdmin(member, botOwnerId);
}

export async function handleTicketCreate(interaction) {
  const settings = guilds.get(interaction.guildId);
  const existing = tickets.getOpenByAuthor(interaction.guildId, interaction.user.id);
  if (existing) {
    return interaction.reply({ content: 'You already have an open ticket.', flags: MessageFlags.Ephemeral });
  }
  const last = tickets.getLastByAuthor(interaction.guildId, interaction.user.id);
  if (last && Date.now() - last.created_at < COOLDOWN_MS) {
    const remaining = Math.ceil((COOLDOWN_MS - (Date.now() - last.created_at)) / 60000);
    return interaction.reply({ content: `Please wait ${remaining} minute(s) before creating another ticket.`, flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const number = tickets.nextNumber(interaction.guildId);
  const padded = String(number).padStart(4, '0');
  const channelName = `ticket-${padded}-${interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20)}`;

  const supportRoleIds = ticketRoles.list(interaction.guildId);
  const permissionOverwrites = [
    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
  ];
  for (const roleId of supportRoleIds) {
    permissionOverwrites.push({ id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  }

  let channel;
  try {
    channel = await interaction.guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: parentId,
      permissionOverwrites
    });
  } catch (err) {
    return interaction.editReply({ content: `Failed to create ticket channel: ${err.message}` });
  }

  tickets.create(interaction.guildId, channel.id, interaction.user.id, number);

  const linked = users.getByDiscord(interaction.user.id);
  const fields = [];
  if (linked) {
    fields.push(
      { name: 'Roblox Username', value: linked.username, inline: true },
      { name: 'Roblox ID', value: linked.roblox_id, inline: true },
      { name: 'Profile', value: `https://www.roblox.com/users/${encodeURIComponent(linked.roblox_id)}/profile`, inline: false },
      { name: 'Verified', value: new Date(linked.verified_at).toLocaleDateString('en-US', { dateStyle: 'long' }), inline: true }
    );
  } else {
    fields.push({ name: 'Roblox Account', value: 'Not verified', inline: false });
  }

  const embed = new EmbedBuilder()
    .setTitle(`Ticket #${padded}`)
    .setDescription(`<@${interaction.user.id}> Describe your problem in this channel.`)
    .addFields(fields)
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:claim').setLabel('Claim').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticket:close').setLabel('Close').setStyle(ButtonStyle.Danger)
  );

  await channel.send({ embeds: [embed], components: [row] });
  return interaction.editReply({ content: `Ticket created: ${channel}` });
}

export async function handleTicketClaim(interaction) {
  if (!hasTicketAccess(interaction.member, interaction.client.botOwnerId)) {
    return interaction.reply({ content: 'You do not have permission to claim this ticket.', flags: MessageFlags.Ephemeral });
  }

  const ticket = tickets.getByChannel(interaction.channelId);
  if (!ticket || ticket.status !== 'open') {
    return interaction.reply({ content: 'This ticket is not open.', flags: MessageFlags.Ephemeral });
  }

  tickets.claim(interaction.channelId, interaction.user.id);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:claim').setLabel(`Claimed by ${interaction.user.username}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId('ticket:close').setLabel('Close').setStyle(ButtonStyle.Danger)
  );
  await interaction.message.edit({ components: [row] });
  return interaction.reply({ content: 'Ticket claimed.', flags: MessageFlags.Ephemeral });
}

export async function handleTicketClose(interaction) {
  if (!hasTicketAccess(interaction.member, interaction.client.botOwnerId)) {
    return interaction.reply({ content: 'You do not have permission to close this ticket.', flags: MessageFlags.Ephemeral });
  }
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:close-confirm').setLabel('Confirm close').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket:close-cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
  );
  return interaction.reply({ content: 'Are you sure you want to close this ticket?', components: [row], flags: MessageFlags.Ephemeral });
}

export async function handleTicketCloseConfirm(interaction) {
  if (!hasTicketAccess(interaction.member, interaction.client.botOwnerId)) {
    return interaction.reply({ content: 'You do not have permission to close this ticket.', flags: MessageFlags.Ephemeral });
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const ticket = tickets.getByChannel(interaction.channelId);
  if (!ticket || ticket.status === 'closed') {
    return interaction.editReply({ content: 'This ticket is already closed.' });
  }

  tickets.close(interaction.channelId, interaction.user.id);

  let transcript = '';
  try {
    const messages = [];
    let lastId;
    while (true) {
      const batch = await interaction.channel.messages.fetch({ limit: 100, ...(lastId ? { before: lastId } : {}) });
      if (batch.size === 0) break;
      for (const [, msg] of batch) messages.push(msg);
      lastId = batch.last()?.id;
      if (batch.size < 100) break;
    }
    messages.reverse();
    transcript = messages.map((m) => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content}`).join('\n');
  } catch {}

  const settings = guilds.get(interaction.guildId);
  const closedAt = new Date().toISOString();
  const createdAt = new Date(ticket.created_at).toISOString();

  const logEmbed = new EmbedBuilder()
    .setTitle(`Ticket #${String(ticket.number).padStart(4, '0')} Closed`)
    .addFields(
      { name: 'Author', value: `<@${ticket.author_id}>`, inline: true },
      { name: 'Claimed by', value: ticket.claimed_by ? `<@${ticket.claimed_by}>` : 'None', inline: true },
      { name: 'Closed by', value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Created', value: createdAt, inline: false },
      { name: 'Closed', value: closedAt, inline: false }
    )
    .setTimestamp();

  if (settings?.ticket_log_channel_id) {
    try {
      const logChannel = await interaction.guild.channels.fetch(settings.ticket_log_channel_id).catch(() => null);
      if (logChannel) {
        const files = transcript ? [{ attachment: Buffer.from(transcript, 'utf-8'), name: `transcript-ticket-${ticket.number}.txt` }] : [];
        await logChannel.send({ embeds: [logEmbed], files });
      }
    } catch {}
  }

  try {
    const author = await interaction.guild.members.fetch(ticket.author_id).catch(() => null);
    if (author) {
      await author.send(`Your ticket #${String(ticket.number).padStart(4, '0')} on ${interaction.guild.name} was closed by ${interaction.user.tag}.`).catch(() => {});
    }
  } catch {}

  await interaction.editReply({ content: 'Ticket closed.' });

  setTimeout(async () => {
    try { await interaction.channel.delete(); } catch {}
  }, 2000);
}

export async function handleTicketCloseCancel(interaction) {
  return interaction.update({ content: 'Close cancelled.', components: [] });
}
