import { Client, Collection, GatewayIntentBits } from 'discord.js';
import { config } from './config.js';
import { users, oauthStates } from './db.js';
import { commands } from './commands/index.js';
import { createState, applyVerification } from './verification.js';
import { startServer } from './server.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection(commands.map((command) => [command.data.name, command]));
client.usersDb = users;
client.createState = createState;
client.config = config;

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  startServer(client, config.port);
  setInterval(() => oauthStates.purge(), 60 * 1000);
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isButton() && interaction.customId === 'verify') {
      return client.commands.get('verify').execute(interaction);
    }
    if (!interaction.isChatInputCommand()) return;
    const command = client.commands.get(interaction.commandName);
    if (command) await command.execute(interaction);
  } catch (error) {
    console.error(error);
    const reply = { content: 'Something went wrong.', ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(reply);
    else await interaction.reply(reply);
  }
});

client.on('guildMemberAdd', async (member) => {
  const linked = users.getByDiscord(member.id);
  if (!linked) return;
  try { await applyVerification(member, { username: linked.username, display_name: linked.display_name }); } catch (error) { console.error(error); }
});

client.login(config.discordToken);
