'use strict';

class ServiceProtocol {

  constructor(bravia, protocol) {
    this.bravia = bravia;
    this.protocol = protocol;
    this._methods = [];
  }

  async getVersions() {
    const versions = await this.invokeMethods('getVersions');
    return versions;
  }

  async getMethodTypes(version) {
   
    if (this._methods.length > 0) {
    
      this.initialized = true;
    
      if (version) {
        return this._methods.find(method => method.version === version);
      } else {
        return this._methods;
      }
   
    }
    
    const versions = await this.getVersions();
    
    for(const id of versions){
      let data = await this.invokeMethods('getMethodTypes', '1.0', id);
      
      let availableMethods = data.map(method => {
        return method[0];
      });       
      
      let methods = data.map(method => {
        
        let options = {
          method: method[0],
          in: method[1].map(arg => { 
            return arg.startsWith('{') 
              ? arg.slice(-1) === '*'
                ? JSON.parse(arg.substring(0, arg.length - 1))
                : JSON.parse(arg)
              : arg;
          }),
          out: method[2].map(arg => { 
            return arg.startsWith('{') 
              ? arg.slice(-1) === '*'
                ? JSON.parse(arg.substring(0, arg.length - 1))
                : JSON.parse(arg)
              : arg;
          }),
          version: method[3]
        };
        
        return options;
        
      });
      
      this._methods.push({ endpoint: this.protocol, version: id, availableMethods: availableMethods, methods: methods });
    }
    
    this.initialized = true;
    
    return this._methods;

  }

  async invoke(method, version, params, turnOn) {
  
    if(!this.initialized)
      await this.getMethodTypes();
      
    let apiMethod = this._methods.find(mthd => mthd.availableMethods.includes(method));
    
    if(apiMethod){
    
      if(Array.isArray(apiMethod))
        apiMethod = apiMethod[apiMethod.length-1];
   
      if(apiMethod.version !== version)
        console.log('Requested version (' + version + ') could not be found. Replacing it with v' + apiMethod.version);
         
      version = apiMethod.version;
   
    } else {
   
      throw new Error('Requested method (' + method + ') could not be found!');
      
    }

    const response = await this.bravia._request({
      path: `/${this.protocol}`,
      json: {
        id: 3,
        method: method,
        version: version || '1.0',
        params: params ? [params] : []
      },
      turnOn: turnOn
    });

    if (response.data.results) {
      return response.data.results;
    } else if (response.data.result) {
      return response.data.result[(response.data.result.length > 1 ? 1 : 0)];
    }
     
  }
  
  async invokeMethods(method, version, params, turnOn) {

    const response = await this.bravia._request({
      path: `/${this.protocol}`,
      json: {
        id: 3,
        method: method,
        version: version || '1.0',
        params: params ? [params] : []
      },
      turnOn: turnOn
    });

    if (response.data.results) {
      return response.data.results;
    } else if (response.data.result) {
      return response.data.result[(response.data.result.length > 1 ? 1 : 0)];
    }
     
  }
  
}

module.exports = ServiceProtocol;
