'use strict';

const debug = require('debug')('bravia:device');
const crypto = require('crypto');
const got = require('got');
const parseString = require('xml2js').parseStringPromise;
const prompt = require('enquirer').prompt;
const SsdpClient = require('node-ssdp').Client;
const URL = require('url').URL;
const wol = require('wake_on_lan');

const { request } = require('./request');
const Service = require('./service');
const SERVICE_PROTOCOLS = require('./protocols');

const SSDP_SERVICE_TYPE = 'urn:schemas-sony-com:service:IRCC:1';
const DEFAULT_TIME_BETWEEN_COMMANDS = 350;

const DEFAULTS = {
  name: '@seydx/bravia',
  host: undefined,
  mac: undefined,
  port: 80,
  psk: false,
  pin: true,
};

const setTimeoutAsync = (ms) => new Promise((res) => setTimeout(res, ms));

const genUUID = (name) => {
  const sha1sum = crypto.createHash('sha1');
  sha1sum.update(name);
  const s = sha1sum.digest('hex');
  let i = -1;
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    i += 1;
    switch (c) {
      case 'y':
        return ((parseInt('0x' + s[i], 16) & 0x3) | 0x8).toString(16);
      case 'x':
      default:
        return s[i];
    }
  });
};

class Bravia {
  constructor(options = {}) {
    this.options = {
      ...DEFAULTS,
      ...options,
      pin: options.psk ? false : true,
    };

    this.credentials = {};
    this.services = new Map();
    this.irccCodes = [];
    this.initialized = false;

    if (this.options.psk) {
      this.credentials.psk = this.options.psk;
    }

    if (this.options.pin) {
      this.credentials.pin = {
        name: this.options.name,
        uuid: genUUID(this.options.name),
        token: this.options.token,
        expires: this.options.expires,
      };
    }

    debug('Options set', this.options);
    debug('Credentials set', this.credentials);

    if (this.options.host) {
      this.url = new URL(`http://${this.options.host}:${this.options.port}/sony`);
      debug('Using url', this.url.toString());

      for (const protocol of SERVICE_PROTOCOLS) {
        debug(`Creating service /${protocol}`);
        this.services.set(protocol, new Service(protocol, this.url, this.credentials));
      }

      this.initialized = true;
    } else {
      debug('Module not initialized, no "host" defined!');
    }
  }

  async refreshToken() {
    if (this.credentials.pin) {
      const expireDateUnix = new Date(this.credentials.pin.expires).getTime();
      const nowDateUnix = new Date().getTime();

      if (!this.credentials.pin.token || expireDateUnix <= nowDateUnix) {
        await this.pair(false, true);
      }
    }

    return this.credentials;
  }

  async describe() {
    const services = Array.from(this.services.values());
    const result = await Promise.all(
      services.map(async (service) => {
        const desc = await service.describe();
        return {
          service: desc.protocol,
          methods: desc.methods,
        };
      })
    );

    return result;
  }

  async discover() {
    const ssdp = new SsdpClient();
    const discovered = [];

    debug('Starting discovery.');

    ssdp.search(SSDP_SERVICE_TYPE);
    ssdp.on('response', async (headers, statusCode, data) => {
      if (statusCode === 200) {
        try {
          const response = await got(headers.LOCATION);
          const result = await parseString(response.body);
          const device = result.root.device[0];

          if (device.serviceList) {
            // Not all devices return a serviceList (e.g. Philips Hue gateway responds without serviceList)
            const service = device.serviceList[0].service.find(
              (service) => service.serviceType[0] === SSDP_SERVICE_TYPE
            );

            const deviceUrl = new URL(service.controlURL[0].split('/ircc')[0]);

            if (!discovered.some((device) => device.host === deviceUrl.host)) {
              debug(`Found new device: ${device.friendlyName[0]} (${deviceUrl.host})`);

              const serviceMap = new Map();

              for (const protocol of SERVICE_PROTOCOLS) {
                debug(`Creating service /${protocol}`);
                serviceMap.set(protocol, new Service(protocol, deviceUrl, {}));
              }

              const discoveredSercices = Array.from(serviceMap.values());

              const services = await Promise.all(
                discoveredSercices.map(async (service) => {
                  const desc = await service.describe();
                  return {
                    service: desc.protocol,
                    methods: desc.methods,
                  };
                })
              );

              discovered.push({
                host: deviceUrl.host,
                port: deviceUrl.port || 80,
                friendlyName: device.friendlyName[0],
                manufacturer: device.manufacturer[0],
                manufacturerURL: device.manufacturerURL[0],
                modelName: device.modelName[0],
                UDN: device.UDN[0],
                services: services,
                scalar: device['av:X_ScalarWebAPI_DeviceInfo'],
                ircc: device['av:X_IRCC_DeviceInfo'],
                ircc_codes: device['av:X_IRCCCodeList'],
                rdis: device['av:X_RDIS_DeviceInfo'],
              });
            }
          }
        } catch (err) {
          ssdp.stop();
          throw new Error(`Error retrieving data for device ${data.address}. Error: ${err.message}`);
        }
      }
    });

    await setTimeoutAsync(5000);

    debug('Stopping discovery.');
    debug(`Found ${discovered.length} device(s)`);

    ssdp.stop();

    return discovered;
  }

  async pair(pin, refresh) {
    if (!this.initialized) {
      throw new Error('Module not initialized!');
    }

    const headers = {};

    if (pin) {
      debug(`Using PIN - ${pin} - for authentication`);

      const encodedPIN = Buffer.from(`:${pin}`, 'utf-8').toString('base64');
      headers.Authorization = `Basic ${encodedPIN}`;
    }

    const params = [
      {
        clientid: `${this.credentials.pin.name}:${this.credentials.pin.uuid}`,
        nickname: `${this.credentials.pin.name}`,
      },
      [
        {
          clientid: `${this.credentials.pin.name}:${this.credentials.pin.uuid}`,
          value: 'yes',
          nickname: `${this.credentials.pin.name}`,
          function: 'WOL',
        },
      ],
    ];

    try {
      const response = await request(
        `${this.url}/accessControl`,
        this.credentials,
        {
          id: 1,
          method: 'actRegister',
          version: '1.0',
          params: params,
        },
        headers,
        true
      );

      if (response.body.turnedOff) {
        throw new Error('Please turn on TV to handle authentication process through PIN.');
      }

      if (response.headers['set-cookie']) {
        this.credentials.pin = {
          ...this.credentials.pin,
          token: response.headers['set-cookie'][0].split(';')[0].split('auth=')[1],
          expires: response.headers['set-cookie'][0].split(';')[3].split('Expires=')[1],
        };

        debug('New token: %s', this.credentials.pin.token);

        return this.credentials.pin;
      } else {
        throw new Error(response);
      }
    } catch (err) {
      if (err.code === 401) {
        if (refresh) {
          throw new Error('Please use the CLI to register the TV before using this module!');
        }

        const pinPrompt = await prompt({
          type: 'input',
          name: 'pin',
          message: 'Please enter the four-digit PIN.',
        });

        return this.pair(pinPrompt.pin);
      } else {
        throw new Error(err);
      }
    }
  }

  async getIRCCCodes() {
    if (!this.initialized) {
      throw new Error('Module not initialized!');
    }

    if (this.irccCodes.length > 0) {
      return this.irccCodes;
    }

    const response = await request(
      `${this.url}/system`,
      this.credentials,
      {
        id: 1,
        method: 'getRemoteControllerInfo',
        version: '1.0',
        params: [],
      },
      {}
    );

    this.irccCodes = response.result[1];

    return this.irccCodes;
  }

  async exec(protocol, command, version, data, headers) {
    if (!this.initialized) {
      throw new Error('Module not initialized!');
    }

    const service = this.services.get(protocol);

    if (!service) {
      debug('Available services:', this.services.keys());
      throw new Error(`Service Protocol "${protocol}" not known!`);
    }

    await this.refreshToken();

    return service.invoke(command, version, data, headers);
  }

  async execCommand(codes, delay) {
    if (!this.initialized) {
      throw new Error('Module not initialized!');
    }

    await this.refreshToken();
    await this.getIRCCCodes();

    delay = delay || DEFAULT_TIME_BETWEEN_COMMANDS;

    if (!Array.isArray(codes)) {
      codes = [codes];
    }

    for (const code of codes) {
      const irccCode = this.irccCodes.find((irccCode) => irccCode.name === code || irccCode.value === code);

      if (!irccCode) {
        return new Error(`Unknown IRCC code: ${code}.`);
      }

      debug(`Send ircc command: ${irccCode.name} (${irccCode.value})`);

      await request(`${this.url}/ircc`, this.credentials, {
        xml: `<?xml version="1.0"?>
        <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
            <s:Body>
                <u:X_SendIRCC xmlns:u="urn:schemas-sony-com:service:IRCC:1">
                    <IRCCCode>${irccCode.value}</IRCCCode>
                </u:X_SendIRCC>
            </s:Body>
        </s:Envelope>`,
      });

      if (codes.length > 1) {
        await setTimeoutAsync(delay);
      }
    }

    return;
  }

  async wake(mac, options = {}) {
    return new Promise(async (resolve, reject) => {
      mac = mac || this.options.mac;

      if (/^([0-9A-F]{2}[:-]){5}([0-9A-F]{2})$/.test(mac)) {
        options = {
          address: options.subnet || '255.255.255.255',
          num_packets: options.num_packets || 10,
          interval: options.interval || 100,
          port: options.port || 9,
        };

        debug('Sending magic packets to %s', mac);
        debug('WOL Options %O', options);

        //https://pro-bravia.sony.net/develop/integrate/ip-control/index.html#wake-on-lan
        wol.wake(mac, options, async (error) => {
          if (error) {
            return reject(error);
          }

          try {
            debug('Waking up TV through API...');
            await this.exec('system', 'setPowerStatus', '1.0', { status: true });
          } catch (err) {
            reject(err);
          } finally {
            debug(`Magic packets send to ${mac}`);
            resolve();
          }
        });
      } else {
        debug('No valid MAC address! Waking up TV through API...');

        try {
          await this.exec('system', 'setPowerStatus', '1.0', { status: true });
          resolve();
        } catch (err) {
          reject(err);
        }
      }
    });
  }
}

module.exports = Bravia;
