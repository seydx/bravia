#!/usr/bin/env node

const caporal = require('caporal');
const Bravia = require('../lib/bravia');
const project = require('../package.json');

const SERVICE_PROTOCOLS = require('../lib/protocols');
const cli = caporal;

cli
  .version(project.version)
  .command('pair', 'Pair with a Bravia TV or refresh existing token')
  .argument('<host>', 'The address of your Bravia TV', cli.STRING)
  .option('-p, --port <port>', 'The port of your Bravia TV (Default: 80)', cli.INTEGER)
  .option('-n, --name <name>', 'Name for the app (Default BraviaTV)', cli.STRING)
  .action(async (args, options, logger) => {
    try {
      const bravia = new Bravia({
        name: options.name || '@seydx/bravia',
        host: args.host,
        port: options.port || 80,
        pin: true,
      });

      const credentials = await bravia.pair();
      logger.info(credentials);

      process.exit();
    } catch (error) {
      logger.error(error.message);
      logger.debug(error.stack);

      process.exit();
    }
  })

  .command('methods', 'Retrieves all the system method types and versions')
  .argument('<host>', 'The address of your Bravia TV', cli.STRING)
  .option('-p, --port <port>', 'The port of your Bravia TV (Default: 80)', cli.INTEGER)
  .action(async (args, options, logger) => {
    try {
      const bravia = new Bravia({
        host: args.host,
        port: options.port || 80,
      });

      const methods = await bravia.describe();
      console.log(JSON.stringify(methods, null, 2));

      process.exit();
    } catch (error) {
      logger.error(error.message);
      logger.debug(error.stack);

      process.exit();
    }
  })

  .command('exec', 'Execute API call')
  .argument('<host>', 'The address of your Bravia TV', cli.STRING)
  .argument('<protocol>', 'API Protocol (Endpoint)', cli.STRING)
  .argument('<service>', 'API Service', cli.STRING)
  .argument('[version]', 'API Service Version', cli.STRING)
  .argument('[command]', 'API Command', cli.STRING)
  .option('-p, --port <port>', 'The port of your Bravia TV (Default: 80)', cli.INTEGER)
  .option('-n, --name <name>', 'Name for the app (Default BraviaTV)', cli.STRING)
  .option('--psk, <psk>', 'Pre-Shared Key (if not set, PIN authentication will be used)', cli.STRING)
  .action(async (args, options, logger) => {
    try {
      if (!SERVICE_PROTOCOLS.includes(args.protocol)) {
        return logger.error(`Invalid Protocol! Available protocols: ${SERVICE_PROTOCOLS.toString()}`);
      }

      const command = JSON.parse(args.command || '{}');

      const bravia = new Bravia({
        name: options.name || '@seydx/bravia',
        host: args.host,
        port: options.port || 80,
        psk: options.psk || false,
      });

      const response = await bravia.exec(args.protocol, args.service, args.version || '1.0', command);
      console.log(JSON.stringify(response, null, 2));

      process.exit();
    } catch (error) {
      logger.error(error.message);
      logger.debug(error.stack);

      process.exit();
    }
  })

  .command('discover', 'Discover alls your TVs in network')
  .action(async (args, options, logger) => {
    try {
      const bravia = new Bravia();
      const devices = await bravia.discover();

      for (const device in devices) {
        console.log(JSON.stringify(devices[device], null, 2));
      }

      process.exit();
    } catch (error) {
      logger.error(error.message);
      logger.debug(error.stack);

      process.exit();
    }
  });

cli.parse(process.argv);
