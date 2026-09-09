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

  const guildIdsToClean = allowedGuildIds.length > 0
    ? allowedGuildIds
    : client.guilds.cache.map((g) => g.id);
  console.log(`[Cleanup] Will check ${guildIdsToClean.length} guild(s)`);

  for (const guildId of guildIdsToClean) {
    try {
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) continue;
      const verifiedRoleName = config.verifiedRole.toLowerCase();
      const verifiedRole = guild.roles.cache.find(
        (r) => r.name.toLowerCase() === verifiedRoleName && !r.managed && r.id !== guild.id
      );
      const unverifiedRole = guild.roles.cache.find(
        (r) => r.name.toLowerCase() === 'unverified' && !r.managed && r.id !== guild.id
      );
      if (!verifiedRole) { console.log(`[Cleanup] Verified role not found in ${guild.name}`); continue; }
      if (!unverifiedRole) { console.log(`[Cleanup] Unverified role not found in ${guild.name}`); continue; }
      const botMember = guild.members.me;
      if (botMember && unverifiedRole.position >= botMember.roles.highest.position) {
        console.log(`[Cleanup] Unverified role is above my highest role in ${guild.name}. Move my role higher.`);
        continue;
      }
      const allUsers = users.getAll();
      let cleaned = 0;
      for (const user of allUsers) {
        try {
          const member = await guild.members.fetch(user.discord_id).catch(() => null);
          if (!member) continue;
          if (member.roles.cache.has(verifiedRole.id) && member.roles.cache.has(unverifiedRole.id)) {
            await member.roles.remove(unverifiedRole);
            cleaned++;
            console.log(`[Cleanup] Removed Unverified from ${member.user.tag} in ${guild.name}`);
          }
        } catch (err) {
          console.error(`[Cleanup] Failed to remove Unverified from ${user.discord_id}:`, err.message);
        }
      }
      if (cleaned > 0) console.log(`[Cleanup] Removed Unverified role from ${cleaned} members in ${guild.name}`);
      else console.log(`[Cleanup] No members needed Unverified removal in ${guild.name}`);
    } catch (error) {
      console.error(`Failed to clean Unverified roles in ${guildId}:`, error);
    }
  }
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
