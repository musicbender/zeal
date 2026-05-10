import pkg from '../package.json' with { type: 'json' };

export const DISCOVERY_API =
  'https://discovery.chargepoint.com/discovery/v3/globalconfig';

export const VERSION: string = pkg.version;
export const USER_AGENT = `node-chargepoint/${VERSION}`;
