import { Command } from 'commander';
import { ChargePoint } from './client.js';
import { APIError } from './exceptions.js';
import { VERSION } from './constants.js';

const program = new Command();

program
  .name('chargepoint')
  .description('ChargePoint EV charging network CLI')
  .version(VERSION)
  .requiredOption('-u, --username <username>', 'ChargePoint username', process.env.CP_USERNAME)
  .option('-t, --token <token>', 'Coulomb session token', process.env.CP_TOKEN)
  .option('-p, --password <password>', 'ChargePoint password (use token instead when possible)', process.env.CP_PASSWORD);

async function getClient(opts: { username: string; token?: string; password?: string }): Promise<ChargePoint> {
  const client = await ChargePoint.create(opts.username, { coulombToken: opts.token });

  if (!opts.token) {
    if (!opts.password) {
      console.error('Error: provide --token or --password to authenticate.');
      process.exit(1);
    }
    await client.loginWithPassword(opts.password);
  }

  return client;
}

program
  .command('account')
  .description('Show account information')
  .action(async () => {
    const opts = program.opts<{ username: string; token?: string; password?: string }>();
    try {
      const client = await getClient(opts);
      const account = await client.getAccount();
      console.log(JSON.stringify(account, null, 2));
    } catch (err) {
      console.error(err instanceof APIError ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command('vehicles')
  .description('List registered electric vehicles')
  .action(async () => {
    const opts = program.opts<{ username: string; token?: string; password?: string }>();
    try {
      const client = await getClient(opts);
      const vehicles = await client.getVehicles();
      console.log(JSON.stringify(vehicles, null, 2));
    } catch (err) {
      console.error(err instanceof APIError ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show current charging session status')
  .action(async () => {
    const opts = program.opts<{ username: string; token?: string; password?: string }>();
    try {
      const client = await getClient(opts);
      const status = await client.getUserChargingStatus();
      if (!status) {
        console.log('No active charging session.');
      } else {
        console.log(JSON.stringify(status, null, 2));
      }
    } catch (err) {
      console.error(err instanceof APIError ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command('chargers')
  .description('List home charger IDs')
  .action(async () => {
    const opts = program.opts<{ username: string; token?: string; password?: string }>();
    try {
      const client = await getClient(opts);
      const chargers = await client.getHomeChargers();
      console.log(JSON.stringify(chargers, null, 2));
    } catch (err) {
      console.error(err instanceof APIError ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command('start <deviceId>')
  .description('Start a charging session on a device')
  .action(async (deviceId: string) => {
    const opts = program.opts<{ username: string; token?: string; password?: string }>();
    try {
      const client = await getClient(opts);
      const session = await client.startChargingSession(parseInt(deviceId, 10));
      console.log(JSON.stringify(session, null, 2));
    } catch (err) {
      console.error(err instanceof APIError ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command('station <deviceId>')
  .description('Show details for a charging station')
  .action(async (deviceId: string) => {
    const opts = program.opts<{ username: string; token?: string; password?: string }>();
    try {
      const client = await getClient(opts);
      const station = await client.getStation(parseInt(deviceId, 10));
      console.log(JSON.stringify(station, null, 2));
    } catch (err) {
      console.error(err instanceof APIError ? err.message : String(err));
      process.exit(1);
    }
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(String(err));
  process.exit(1);
});
