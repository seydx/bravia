'use strict';

const debug = require('debug')('bravia:service');
const { request } = require('./request');

const paramsList = (params) => (Array.isArray(params) ? params : [params]);

class ServiceProtocol {
  constructor(protocol, url, credentials) {
    this.protocol = protocol;
    this.url = `${url}/${protocol}`;
    this.credentials = credentials;

    this.methods = [];
  }

  async getVersions() {
    const response = await request(this.url, this.credentials, {
      id: 1,
      method: 'getVersions',
      version: '1.0',
      params: [],
    });

    return response.result;
  }

  async describe(version) {
    if (this.methods.length > 0) {
      if (version) {
        return this.methods.filter((method) => method.version === version);
      } else {
        return this.methods;
      }
    }

    try {
      const versions = await this.getVersions();

      for (const version of versions) {
        if (version.length > 1) {
          for (const subversion of version) {
            const response = await request(this.url, this.credentials, {
              id: 1,
              method: 'getMethodTypes',
              version: '1.0',
              params: paramsList(subversion),
            });

            this.methods = this.methods.concat(
              response.results.map((method) => {
                return {
                  method: method[0],
                  version: method[method.length - 1],
                };
              })
            );
          }
        } else {
          const response = await request(this.url, this.credentials, {
            id: 1,
            method: 'getMethodTypes',
            version: '1.0',
            params: paramsList(version),
          });

          this.methods.push(
            response.results.map((method) => {
              return {
                method: method[0],
                version: method[method.length - 1],
              };
            })
          );
        }
      }
    } catch (err) {
      if (err.code !== 404) {
        throw new Error(err);
      }
    }

    return {
      protocol: this.protocol,
      methods: this.methods,
    };
  }

  async invoke(method, version = '1.0', data = [], headers = {}) {
    /*
     * "id" is an integer and “0" must not be used. "0" is used as a special number system. The id can be set to "1"
     * Null valued parameters must be regarded as absent in the request/response, unless otherwise mentioned in each API specification
     * "params" must be an array type of fixed length.
     */

    const service = await this.describe(version);
    const methodExist = service.methods.filter((availableMethod) => availableMethod.method === method);

    if (!methodExist.length) {
      debug('Available methods:', service.methods);

      let error = new Error(`Service Methods "${method}" not known!`);

      Object.assign(error, {
        title: 'Unknown Service Method',
        code: 'UNKNOWN',
        message: 'Unknown Service Method',
        soap: {},
        payload: data,
        url: this.url,
      });

      throw error;
    } else {
      const versionExist = methodExist.find((availableMethod) => availableMethod.version === version);

      if (!versionExist) {
        const oldVersion = version;
        version = methodExist[methodExist.length - 1].version; //use always latest version

        debug(
          `Method version "${oldVersion}" does not exist for "${method}"! It will be replaced with latest available version: "${version}".`
        );
      }
    }

    const options = {
      id: 1,
      method: method,
      version: version,
      params: paramsList(data),
    };

    debug('Invoking /%s %O', this.protocol, options);

    return await request(this.url, this.credentials, options, headers);
  }
}

module.exports = ServiceProtocol;
