import { config, redirectUri } from './config.js';

const oauthBase = 'https://apis.roblox.com/oauth/v1';

export function authorizationUrl(state) {
  const params = new URLSearchParams({
    client_id: config.robloxClientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid profile',
    state
  });
  return `${oauthBase}/authorize?${params}`;
}

async function jsonRequest(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Roblox returned ${response.status}${body ? `: ${body.slice(0, 300)}` : ''}`);
  }
  return response.json();
}

export async function exchangeCode(code) {
  const body = new URLSearchParams({
    client_id: config.robloxClientId,
    client_secret: config.robloxClientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri
  });
  return jsonRequest(`${oauthBase}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
}

export function getUserInfo(accessToken) {
  return jsonRequest(`${oauthBase}/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}

export function getUser(userId) {
  return jsonRequest(`https://users.roblox.com/v1/users/${encodeURIComponent(userId)}`);
}

export function getHeadshot(userId) {
  return jsonRequest(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${encodeURIComponent(userId)}&size=150x150&format=Png&isCircular=false`);
}
