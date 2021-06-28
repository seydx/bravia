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
    const response = await this.invoke('getVersions');
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
            const response = await this.invoke('getMethodTypes', '1.0', subversion);

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
          const response = await this.invoke('getMethodTypes', '1.0', version);

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

  async invoke(method, version = '1.0', params = [], headers = {}) {
    /*
     * "id" is an integer and “0" must not be used. "0" is used as a special number system. The id can be set to "1"
     * Null valued parameters must be regarded as absent in the request/response, unless otherwise mentioned in each API specification
     * "params" must be an array type of fixed length.
     */

    const options = {
      id: 1,
      method: method,
      version: version,
      params: paramsList(params),
    };

    debug('Invoking /%s %O', this.protocol, options);

    return await request(this.url, this.credentials, options, headers);
  }
}

module.exports = ServiceProtocol;
