import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ChargePoint } from '../../src/client.js';
import { CommunicationError, DatadomeCaptcha, LoginError } from '../../src/exceptions.js';

function loadEnvFile(filename: string): void {
  const filePath = resolve(process.cwd(), filename);
  if (!existsSync(filePath)) return;
  for (const rawLine of readFileSync(filePath, 'utf-8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    // Strip surrounding quotes — common when copy-pasting shell export syntax
    if (val.length >= 2) {
      const q = val[0];
      if ((q === '"' || q === "'") && val[val.length - 1] === q) {
        val = val.slice(1, -1);
      }
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnvFile('.env.e2e');

export interface E2EContext {
  client: ChargePoint;
  chargerId: number | undefined;
}

export async function createAuthenticatedClient(): Promise<E2EContext> {
  const username = process.env['CP_USERNAME'];
  const password = process.env['CP_PASSWORD'];
  const token = process.env['CP_TOKEN'];

  if (!username) {
    throw new Error('[E2E] CP_USERNAME is required. Set it in .env.e2e or export it in your shell.');
  }

  let client: ChargePoint;

  if (token) {
    console.log(`[E2E] Auth: token (${token.slice(0, 8)}...)`);
    client = await ChargePoint.create(username, { coulombToken: token });
  } else {
    if (!password) {
      throw new Error(
        '[E2E] Either CP_TOKEN or CP_PASSWORD must be set.\n' +
          '      Set them in .env.e2e or export them in your shell.',
      );
    }
    console.log('[E2E] Auth: password (CP_TOKEN not set — will attempt password login)');
    client = await ChargePoint.create(username);
    try {
      await client.loginWithPassword(password);
    } catch (err) {
      if (err instanceof DatadomeCaptcha) {
        throw new Error(
          '[E2E] Bot protection (Datadome) blocked password login.\n' +
            '      Log in at https://driver.chargepoint.com, copy the coulomb_sess cookie,\n' +
            '      and set CP_TOKEN in .env.e2e. See README.md § "Obtaining Tokens Manually".',
        );
      }
      if (err instanceof LoginError) {
        throw new Error(
          `[E2E] Password login failed (HTTP ${err.statusCode}).\n` +
            `      Response body: ${JSON.stringify(err.body)}\n` +
            '      Check CP_PASSWORD in .env.e2e, or obtain a token and set CP_TOKEN instead.',
        );
      }
      throw err;
    }
  }

  console.log('[E2E] coulombToken (paste into CP_TOKEN in .env.e2e to skip re-login):');
  console.log(`      ${client.coulombToken ?? '(none — something went wrong)'}\n`);

  const ep = client.globalConfig.endpoints;
  console.log(`[E2E] Resolved endpoints:`);
  console.log(`        accountsEndpoint:  ${ep.accountsEndpoint}`);
  console.log(`        hcpoHcmEndpoint:   ${ep.hcpoHcmEndpoint}`);
  console.log(`        ssoEndpoint:       ${ep.ssoEndpoint}`);

  const debug = process.env['E2E_DEBUG'] === 'true';

  if (debug) {
    const acctResp = await client._request('GET', `${ep.accountsEndpoint}/v1/driver/profile/user`);
    console.log('[E2E DEBUG] getAccount raw:', JSON.stringify(await acctResp.json(), null, 2));
  }

  let chargerId: number | undefined;
  try {
    const chargerIds = await client.getHomeChargers();
    chargerId = chargerIds[0];
    console.log(`[E2E] Home chargers: [${chargerIds.join(', ')}]`);

    if (debug && chargerIds.length === 0) {
      // Log the raw charger list response to see what the API actually returned
      const account = await client.getAccount();
      const rawResp = await client._request(
        'GET',
        `${ep.hcpoHcmEndpoint}/api/v1/configuration/users/${account.user.userId}/chargers`,
      );
      console.log('[E2E DEBUG] getHomeChargers raw:', JSON.stringify(await rawResp.json(), null, 2));
    }
  } catch (err) {
    if (err instanceof CommunicationError) {
      console.warn(
        `[E2E] getHomeChargers failed (HTTP ${err.statusCode}): ${JSON.stringify(err.body)}\n` +
          '      chargerId will be undefined — charger tests will fail in beforeAll.',
      );
    } else {
      console.warn('[E2E] getHomeChargers threw unexpectedly:', err);
    }
  }

  return { client, chargerId };
}
