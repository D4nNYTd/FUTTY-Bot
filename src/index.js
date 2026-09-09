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
