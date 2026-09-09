import { Client, Collection, EmbedBuilder, GatewayIntentBits, MessageFlags, REST, Routes } from 'discord.js';
import { config } from './config.js';
import { users, oauthStates } from './db.js';
import { commands } from './commands/index.js';
import { createState, applyVerification } from './verification.js';
import { startServer } from './server.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
client.commands = new Collection(commands.map((command) => [command.data.name, command]));
client.usersDb = users;
client.createState = createState;
client.config = config;

const allowedGuildIds = config.guildId
  ? config.guildId.split(',').map((id) => id.trim()).filter(Boolean)
  : [];

client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`[Cleanup] GUILD_ID env: ${config.guildId || '(not set)'}`);
  console.log(`[Cleanup] Allowed guilds: ${allowedGuildIds.length > 0 ? allowedGuildIds.join(', ') : '(none - will scan all bot guilds)'}`);
  const rest = new REST({ version: '10' }).setToken(config.discordToken);
  const route = config.guildId
    ? Routes.applicationGuildCommands(config.discordClientId, config.guildId)
    : Routes.applicationCommands(config.discordClientId);
  try {
    await rest.put(route, { body: commands.map((command) => command.data.toJSON()) });
    console.log(`Registered ${commands.length} slash commands${config.guildId ? ` for guild ${config.guildId}` : ' globally'}.`);
  } catch (error) {
    console.error('Failed to register slash commands:', error);
  }
  startServer(client, config.port);
  setInterval(() => oauthStates.purge(), 60 * 1000);

  // Wait for guild/member cache to populate
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const guildIdsToClean = allowedGuildIds.length > 0
    ? allowedGuildIds
    : client.guilds.cache.map((g) => g.id);
  console.log(`[Cleanup] Will check ${guildIdsToClean.length} guild(s): ${guildIdsToClean.join(', ')}`);

  const dbUsers = users.getAll();
  console.log(`[Cleanup] Total verified users in DB: ${dbUsers.length}`);
  if (dbUsers.length === 0) {
    console.log('[Cleanup] WARNING: No verified users found in database. Cleanup will skip.');
  }

  for (const guildId of guildIdsToClean) {
    try {
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) {
        console.log(`[Cleanup] Guild ${guildId} not found or inaccessible`);
        continue;
      }
      console.log(`[Cleanup] Processing guild: ${guild.name} (${guild.id})`);

      const verifiedRoleName = config.verifiedRole.toLowerCase();
      const verifiedRole = guild.roles.cache.find(
        (r) => r.name.toLowerCase() === verifiedRoleName && !r.managed && r.id !== guild.id
      );
      const unverifiedRole = guild.roles.cache.find(
        (r) => r.name.toLowerCase() === 'unverified' && !r.managed && r.id !== guild.id
      );

      console.log(`[Cleanup] Looking for Verified role (name: "${config.verifiedRole}"): ${verifiedRole ? `found (${verifiedRole.name}, pos ${verifiedRole.position})` : 'NOT FOUND'}`);
      console.log(`[Cleanup] Looking for Unverified role: ${unverifiedRole ? `found (${unverifiedRole.name}, pos ${unverifiedRole.position})` : 'NOT FOUND'}`);

      if (!verifiedRole) { console.log(`[Cleanup] SKIP: Verified role not found in ${guild.name}`); continue; }
      if (!unverifiedRole) { console.log(`[Cleanup] SKIP: Unverified role not found in ${guild.name}`); continue; }

      const botMember = guild.members.me;
      if (botMember) {
        console.log(`[Cleanup] Bot highest role: ${botMember.roles.highest.name} (pos ${botMember.roles.highest.position})`);
      }
      if (botMember && unverifiedRole.position >= botMember.roles.highest.position) {
        console.log(`[Cleanup] BLOCKED: Unverified role (pos ${unverifiedRole.position}) is at or above bot's highest role (pos ${botMember.roles.highest.position}). Move bot role higher in server settings.`);
        continue;
      }

      let cleaned = 0;
      let skippedNotVerified = 0;
      let skippedNoUnverified = 0;
      let fetchFailed = 0;

      for (const user of dbUsers) {
        try {
          const member = await guild.members.fetch({ user: user.discord_id, force: true }).catch(() => null);
          if (!member) {
            fetchFailed++;
            continue;
          }
          const roleNames = member.roles.cache.map((r) => r.name).join(', ');
          console.log(`[Cleanup] User ${member.user.tag} roles: [${roleNames}]`);

          // Remove ALL verified roles (any case)
          const allVerifiedRoles = member.roles.cache.filter(
            (r) => r.name.toLowerCase() === verifiedRoleName && !r.managed && r.id !== guild.id
          );
          for (const [, vr] of allVerifiedRoles) {
            await member.roles.remove(vr);
            console.log(`[Cleanup] ✓ Removed Verified role "${vr.name}" (${vr.id}) from ${member.user.tag}`);
          }

          // Remove ALL unverified roles (any case)
          const allUnverifiedRoles = member.roles.cache.filter(
            (r) => r.name.toLowerCase() === 'unverified' && !r.managed && r.id !== guild.id
          );
          for (const [, ur] of allUnverifiedRoles) {
            await member.roles.remove(ur);
            console.log(`[Cleanup] ✓ Removed unverified role "${ur.name}" (${ur.id}) from ${member.user.tag}`);
          }

          // Re-add single canonical Verified role
          if (verifiedRole) {
            try {
              await member.roles.add(verifiedRole);
              console.log(`[Cleanup] ✓ Added canonical Verified role to ${member.user.tag}`);
              cleaned++;
            } catch (err) {
              console.error(`[Cleanup] ✗ Failed to add Verified to ${member.user.tag}: ${err.message}`);
            }
          }
        } catch (err) {
          console.error(`[Cleanup] ✗ Error removing Unverified from ${user.discord_id}: ${err.message}`);
        }
      }

      console.log(`[Cleanup] Summary for ${guild.name}: removed=${cleaned}, no-verified-role=${skippedNotVerified}, no-unverified-role=${skippedNoUnverified}, fetch-failed=${fetchFailed}, total-db-users=${dbUsers.length}`);

      // Pass 2: Remove Verified role from members NOT in DB
      const verifiedDbIds = new Set(dbUsers.map((u) => u.discord_id));
      let purged = 0;
      try {
        const allMembers = await guild.members.fetch();
        for (const [, member] of allMembers) {
          if (member.user.bot) continue;
          if (verifiedDbIds.has(member.id)) continue;
          const memberVerifiedRoles = member.roles.cache.filter(
            (r) => r.name.toLowerCase() === verifiedRoleName && !r.managed && r.id !== guild.id
          );
          if (memberVerifiedRoles.size === 0) continue;
          for (const [, vr] of memberVerifiedRoles) {
            await member.roles.remove(vr);
            console.log(`[Cleanup] ✓ Purged Verified role "${vr.name}" (${vr.id}) from non-verified ${member.user.tag}`);
            purged++;
          }
        }
      } catch (err) {
        console.error(`[Cleanup] Failed to purge non-verified members: ${err.message}`);
      }
      console.log(`[Cleanup] Purged Verified from ${purged} non-verified members in ${guild.name}`);
    } catch (error) {
      console.error(`[Cleanup] FATAL ERROR processing guild ${guildId}:`, error.message);
    }
  }
  console.log('[Cleanup] Cleanup complete.');

});

client.on('interactionCreate', async (interaction) => {
  try {
    if (allowedGuildIds.length > 0 && interaction.guildId && !allowedGuildIds.includes(interaction.guildId)) {
      if (interaction.isRepliable()) {
        return interaction.reply({ content: 'This bot is not configured for this server.', flags: MessageFlags.Ephemeral });
      }
      return;
    }
    if (interaction.isButton() && interaction.customId === 'verify') {
      return client.commands.get('verify').execute(interaction);
    }
    if (!interaction.isChatInputCommand()) return;
    const command = client.commands.get(interaction.commandName);
    if (command) await command.execute(interaction);
  } catch (error) {
    console.error(error);
    const reply = { content: 'Something went wrong.', flags: MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) await interaction.followUp(reply);
    else await interaction.reply(reply);
  }
});

client.on('guildMemberAdd', async (member) => {
  const linked = users.getByDiscord(member.id);
  if (!linked) return;
  try {
    const result = await applyVerification(member, { username: linked.username, display_name: linked.display_name });
    const embed = new EmbedBuilder()
      .setTitle(member.guild.name)
      .setThumbnail(member.guild.iconURL({ size: 128 }) || null)
      .setDescription(`You have been verified. Your nickname has been set to ${result.nickname}.`);
    await member.send({ embeds: [embed] }).catch(() => {});
  } catch (error) {
    console.error(error);
  }
});

client.login(config.discordToken);
