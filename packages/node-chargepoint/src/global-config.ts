import { DISCOVERY_API } from './constants.js';
import { CommunicationError } from './exceptions.js';
import type { APIEndpoints, GlobalConfiguration } from './types.js';

type RawValue = Record<string, unknown>;

function endpointStr(v: unknown): string {
  if (v !== null && typeof v === 'object' && 'value' in v) {
    return String((v as RawValue).value ?? '');
  }
  return typeof v === 'string' ? v : '';
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
  let response: Response;
  try {
    response = await fetch(DISCOVERY_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ regionCode: region }),
    });
  } catch (err) {
    throw new CommunicationError(0, `Failed to reach ChargePoint discovery API: ${String(err)}`);
  }

  if (!response.ok) {
    throw new CommunicationError(response.status, 'Failed to fetch global configuration.');
  }

  const data = (await response.json()) as RawValue;
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
