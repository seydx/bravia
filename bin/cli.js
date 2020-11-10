#!/usr/bin/env node

const caporal = require('caporal');
const Bravia = require('../src/bravia');
const project = require('../package.json');

let cli = caporal;

cli
  .version(project.version)
  .command('pair', 'Pair with an Bravia TV')
  .argument('<host>', 'The address of your Bravia TV', cli.STRING)
  .option('-n, --name <name>', 'Name for the app (Default Bravia)', cli.STRING)
  .option('-p, --port <port>', 'The port of your Bravia TV (Default: 80)', cli.INTEGER)
  .option('-t, --timeout <timeout>', 'The amount of time (in seconds) to wait for the response (Default 5s)', cli.INTEGER)
  .action(async (args, options, logger) => {
    try {
      let appName = options.name || 'Bravia';
      const bravia = new Bravia({
        host: args.host,
        port: options.port || 80,
        pin: true,
        timeout: options.timeout || 5
      });
      const token = await bravia.pair({name: appName});
      logger.info(token);
      process.exit();
    }
    catch (error) {
      logger.error(error.message);
      logger.debug(error.stack);
      process.exit();
    }
  })
  
  .command('discover', 'Discover alls your TVs in network')
  .option('-t, --timeout <timeout>', 'The amount of time (in seconds) to wait for the response (Default 5s)', cli.INTEGER)
  .action(async (args, options, logger) => {
    try {
      const bravia = new Bravia({
        timeout: options.timeout || 5
      });
      const devices = await bravia.discover(options.timeout || 5);
      for (let device in devices) {
        console.log(devices[device]);
      }
      process.exit();
    }
    catch (error) {
      logger.error(error.message);
      logger.debug(error.stack);
      process.exit();
    }
  })
  
  .command('methods', 'Retrieves all the system method types and versions')
  .argument('<host>', 'The address of your Bravia TV', cli.STRING)
  .option('--psk <PSK>', 'Pre-Shared Key', cli.STRING)
  .option('--token <Token>', 'Token', cli.STRING)
  .option('-p, --port <port>', 'The port of your Bravia TV (Default: 80)', cli.INTEGER)
  .option('-t, --timeout <timeout>', 'The amount of time (in seconds) to wait for the response (Default 5s)', cli.INTEGER)
  .action(async (args, options, logger) => {
    try {
      const bravia = new Bravia({
        host: args.host,
        port: options.port || 80,
        token: options.token || false,
        psk: options.psk || false,
        timeout: options.timeout || 5000
      });
      const methods = await bravia.getAllMethodTypes();
      console.log(JSON.stringify(methods, null, 2));
      process.exit();
    }
    catch (error) {
      logger.error(error.message);
      logger.debug(error.stack);
      process.exit();
    }
  })

cli.parse(process.argv);
