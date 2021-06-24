#!/usr/bin/env node

const caporal = require('caporal');
const Bravia = require('../lib/bravia');
const project = require('../package.json');

let cli = caporal;

cli
  .version(project.version)
  .command('pair', 'Pair with a Bravia TV or refresh existing token')
  .argument('<host>', 'The address of your Bravia TV', cli.STRING)
  .option('-n, --name <name>', 'Name for the app (Default BraviaTV)', cli.STRING)
  .option('-p, --port <port>', 'The port of your Bravia TV (Default: 80)', cli.INTEGER)
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

  .command('discover', 'Discover alls your TVs in network')
  .action(async (args, options, logger) => {
    try {
      const bravia = new Bravia();
      const devices = await bravia.discover();

      for (const device in devices) {
        console.log(devices[device]);
      }

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
  });

cli.parse(process.argv);
