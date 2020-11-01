'use strict';

class ServiceProtocol {

  constructor(bravia, protocol) {
    this.bravia = bravia;
    this.protocol = protocol;
    this._methods = [];
  }

  async getVersions() {
    const versions = await this.invoke('getVersions');
    return versions;
  }

  async getMethodTypes(version) {
   
    if (this._methods.length > 0) {
      if (version) {
        return this._methods.find(method => method.version === version);
      } else {
        return this._methods;
      }
    }
    
    const versions = await this.getVersions();
    
    for(const id of versions){
      let data = await this.invoke('getMethodTypes', '1.0', id);
      this._methods.push({ version: id, methods: data });
    }
    
    return this._methods;

  }

  async invoke(method, version, params) {
  
    const response = await this.bravia._request({
      path: `/${this.protocol}`,
      json: {
        id: 3,
        method: method,
        version: version || '1.0',
        params: params ? [params] : []
      }
    });

    if (response.data.results) {
      return response.data.results;
    } else if (response.data.result) {
      return response.data.result[(response.data.result.length > 1 ? 1 : 0)];
    }
     
    return;
     
  }
  
}

module.exports = ServiceProtocol;
