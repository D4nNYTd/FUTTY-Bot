import express from 'express';
import { oauthStates, users } from './db.js';
import { exchangeCode, getUserInfo } from './roblox.js';
import { verifyMember } from './verification.js';
import { robloxConfigured } from './config.js';

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function page(title, message) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{margin:0;background:#111827;color:#e5e7eb;font:16px system-ui,sans-serif;display:grid;place-items:center;min-height:100vh}main{max-width:420px;padding:32px;text-align:center}h1{font-size:24px}p{line-height:1.5;color:#9ca3af}</style></head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></main></body></html>`;
}

export function startServer(client, port) {
  const app = express();
  app.get('/callback', async (request, response) => {
    if (!robloxConfigured) return response.status(503).send(page('Verification unavailable', 'Roblox verification is not configured yet.'));
    const { code, state, error } = request.query;
    if (error || !code || !state) return response.status(400).send(page('Verification failed', 'The Roblox sign-in was cancelled or incomplete.'));
    const savedState = oauthStates.consume(state);
    if (!savedState) return response.status(400).send(page('Verification failed', 'This verification link is invalid or expired.'));
    try {
      const token = await exchangeCode(code);
      const robloxUser = await getUserInfo(token.access_token);
      const guild = await client.guilds.fetch(savedState.guild_id);
      const member = await guild.members.fetch(savedState.discord_id);
      const result = await verifyMember(member, robloxUser);
      const details = result.warnings.length ? ` Roblox account linked, with warnings: ${result.warnings.join(' ')}` : ' Roblox account linked and your server access was updated.';
      return response.send(page('Verification complete', details));
    } catch (caught) {
      const message = caught.message.includes('already linked') ? caught.message : 'The verification could not be completed.';
      return response.status(400).send(page('Verification failed', message));
    }
  });
  return app.listen(port, '0.0.0.0', () => console.log(`HTTP server listening on port ${port}`));
}
