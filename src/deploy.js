import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { commands } from './commands/index.js';

const rest = new REST({ version: '10' }).setToken(config.discordToken);
const route = config.guildId ? Routes.applicationGuildCommands(config.discordClientId, config.guildId) : Routes.applicationCommands(config.discordClientId);
await rest.put(route, { body: commands.map((command) => command.data.toJSON()) });
console.log(`Registered ${commands.length} commands${config.guildId ? ` for guild ${config.guildId}` : ' globally'}.`);
