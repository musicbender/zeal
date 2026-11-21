import https from 'node:https';
import { DISCOVERY_API, USER_AGENT } from './constants.js';
import { CommunicationError } from './exceptions.js';
import type { APIEndpoints, GlobalConfiguration } from './types.js';

type RawValue = Record<string, unknown>;

// Node 24's built-in fetch automatically adds `Sec-Fetch-Mode: cors`, which
// causes the ChargePoint discovery endpoint to return HTTP 500. Using node:https
// directly avoids that header. Default import (not named) is required so that
// MSW's runtime patch of https.request is visible at call time in unit tests.
async function postJson(url: string, body: string): Promise<{ status: number; data: RawValue }> {
  return new Promise((resolve, reject) => {
    const bodyBuf = Buffer.from(body, 'utf-8');
    const req = https.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': bodyBuf.byteLength,
          'User-Agent': USER_AGENT,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const statusCode = res.statusCode ?? 0;
          if (statusCode < 200 || statusCode >= 300) {
            reject(new CommunicationError(statusCode, 'Failed to fetch global configuration.'));
            return;
          }
          try {
            resolve({ status: statusCode, data: JSON.parse(Buffer.concat(chunks).toString('utf-8')) as RawValue });
          } catch {
            reject(new CommunicationError(statusCode, 'Failed to parse global configuration response.'));
          }
        });
      },
    );
    req.on('error', (err: Error) => {
      reject(new CommunicationError(0, `Failed to reach ChargePoint discovery API: ${err.message}`));
    });
    req.write(bodyBuf);
    req.end();
  });
}

function endpointStr(v: unknown): string {
  const raw =
    v !== null && typeof v === 'object' && 'value' in v
      ? String((v as RawValue).value ?? '')
      : typeof v === 'string'
        ? v
        : '';
  return raw.replace(/\/+$/, ''); // strip trailing slashes so callers can always do `${url}/path`
}

function parseEndpoints(raw: RawValue): APIEndpoints {
  // Support both camelCase and snake_case keys from the discovery API
  const get = (camel: string, snake: string): string =>
    endpointStr(raw[camel] ?? raw[snake] ?? '');

  return {
    accountsEndpoint: get('accountsEndpoint', 'accounts_endpoint'),
    internalApiGatewayEndpoint: get('internalApiGatewayEndpoint', 'internal_api_gateway_endpoint'),
    mapcacheEndpoint: get('mapcacheEndpoint', 'mapcache_endpoint'),
    pandaWebsocketEndpoint: get('pandaWebsocketEndpoint', 'panda_websocket_endpoint'),
    paymentJavaEndpoint: get('paymentJavaEndpoint', 'payment_java_endpoint'),
    paymentPhpEndpoint: get('paymentPhpEndpoint', 'payment_php_endpoint'),
    portalDomainEndpoint: get('portalDomainEndpoint', 'portal_domain_endpoint'),
    portalSubdomain:
      typeof raw.portalSubdomain === 'string'
        ? raw.portalSubdomain
        : typeof raw.portal_subdomain === 'string'
          ? raw.portal_subdomain
          : '',
    ssoEndpoint: get('ssoEndpoint', 'sso_endpoint'),
    webservicesEndpoint: get('webservicesEndpoint', 'webservices_endpoint'),
    websocketEndpoint: get('websocketEndpoint', 'websocket_endpoint'),
    hcpoHcmEndpoint: get('hcpoHcmEndpoint', 'hcpo_hcm_endpoint'),
  };
}

export async function fetchGlobalConfig(region = 'NA'): Promise<GlobalConfiguration> {
  const { data } = await postJson(DISCOVERY_API, JSON.stringify({ regionCode: region }));

  // The API may return the config directly or nested under "globalConfiguration"
  const raw = (typeof data.globalConfiguration === 'object' && data.globalConfiguration !== null
    ? data.globalConfiguration
    : data) as RawValue;

  const endpointsRaw = (raw.endPoints ?? raw.endpoints ?? {}) as RawValue;

  return {
    region: typeof raw.region === 'string' ? raw.region : region,
    defaultCountry: (raw.defaultCountry ?? {}) as GlobalConfiguration['defaultCountry'],
    supportedCountries: Array.isArray(raw.supportedCountries)
      ? (raw.supportedCountries as GlobalConfiguration['supportedCountries'])
      : [],
    defaultCurrency: (raw.currency ?? raw.defaultCurrency ?? {}) as GlobalConfiguration['defaultCurrency'],
    supportedCurrencies: Array.isArray(raw.supportedCurrencies)
      ? (raw.supportedCurrencies as GlobalConfiguration['supportedCurrencies'])
      : [],
    endpoints: parseEndpoints(endpointsRaw),
  };
}
