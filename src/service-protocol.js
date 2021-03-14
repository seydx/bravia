'use strict';

class ServiceProtocol {

  constructor(bravia, protocol) {
    
    this.debug = require('debug')('bravia:service:' + protocol);
    
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
        
        let methods = this._methods.filter(method => method.version === version);
        return methods;
        
      } else {
        
        return this._methods;
        
      }
   
    }
    
    const versions = await this.getVersions();
    
    for(const id of versions){
      
      let data = await this.invoke('getMethodTypes', '1.0', id);
      let resolvedData = this.resolveMethods(data, id);
      
      this._methods.push({ 
        endpoint: this.protocol, 
        version: id, 
        availableMethods: resolvedData.availableMethods, 
        availableParams: resolvedData.availableParams, 
        methods: resolvedData.methods 
      });
      
    }
    
    return this._methods;

  }
  
  resolveMethods(data, id){
    
    let availableMethods = [];
    let availableParams = {};

    let methods = data.map(method => {
      
      this.debug('Registering method %s (%s) for %s', method[0], id, this.protocol);
      
      availableMethods.push(method[0]);
      availableParams[method[0]] = [];
      
      method[1].forEach(arg => {
        if(arg.startsWith('{')){
          if(arg.slice(-1) === '*'){
            Object.keys(JSON.parse(arg.substring(0, arg.length - 1))).forEach(arg2 => {
              this.debug('Registering parameter "%s" for %s (%s)', arg2, method[0], method[3]);
              availableParams[method[0]].push(arg2);
            });
          } else {
            Object.keys(JSON.parse(arg)).forEach(arg3 => {
              this.debug('Registering parameter "%s" for %s (%s)', arg3, method[0], method[3]);
              availableParams[method[0]].push(arg3); 
            });
          }
        } else {
          this.debug('Registering parameter "%s" for %s (%s)', arg, method[0], method[3]);
          availableParams[method[0]].push(arg);
        }
      });

      return {
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
      
    });
    
    return {
      availableMethods: availableMethods,
      availableParams: availableParams,
      methods: methods
    };
    
  }
  
  async checkApiMethod(method, version, params){
    
    if(!this.initialized){
      this.debug('Method types not initialized yet. Initializing available method types before continue');
      await this.getMethodTypes();
      this.initialized = true;
    }
    
    let apiMethod = this._methods.filter(mthd => mthd.availableMethods.includes(method));
    
    if(apiMethod.length){
    
      let apiMethodByVersion = apiMethod.find(method => method.version === version);
      
      if(apiMethodByVersion){
        apiMethod = apiMethodByVersion;
      } else {
        apiMethod = apiMethod[apiMethod.length-1];
      }
   
      if(apiMethod.version !== version)
        this.debug('Requested version (%s) for %s could not be found. Replacing it with v%s', version, method, apiMethod.version);
      
      this.debug('Endpoint options %O', apiMethod);
      this.debug('Method options %O', apiMethod.methods.find(availableMethod => availableMethod.method === method));

      return apiMethod;
   
    } else {
   
      this.debug('Requested method (' + method + ') could not be found!);
      
      return false;
      
    }
    
  }

  async invoke(method, version, params, turnOn) {
    
    let apiMethod;
    
    params = params ? [params] : [];
    version = version || '1.0';
    
    if(method !== 'getVersions' && method !== 'getMethodTypes'){
      apiMethod = await this.checkApiMethod(method, version, params);
      version = apiMethod
        ? apiMethod.version
        : version;
    }
      
    this.debug('Executing action %s (%s)', method, version);

    const response = await this.bravia._request({
      path: `/${this.protocol}`,
      json: {
        id: 3,
        method: method,
        version: version,
        params: params
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
