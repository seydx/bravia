'use strict';

class ServiceProtocol {

  constructor(bravia, protocol) {
    
    this.debug = require('debug')('bravia:service:' + protocol);
    
    this.bravia = bravia;
    this.protocol = protocol;
    this._methods = [];
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
  
  checkApiMethod(method, version, params){
    
    let apiMethod = this._methods.find(mthd => mthd.availableMethods.includes(method));
    
    if(apiMethod){
    
      if(Array.isArray(apiMethod)){
        let apiMethodByVersion = apiMethod.find(method => method.version === version);
        if(apiMethodByVersion){
          apiMethod = apiMethodByVersion;
        } else {
          apiMethod = apiMethod[apiMethod.length-1];
        }
      }
   
      if(apiMethod.version !== version){
        this.debug('Requested version (%s) for %s could not be found. Replacing it with v%s', version, method, apiMethod.version);
      } else {
        this.debug('Requested version %s for %s found', version, method);
      }
      
      this.debug('Endpoint options %O', apiMethod);
      
      version = apiMethod.version;
      
      if(params.length){
      
        let paramMethod = apiMethod.methods.find(availableMethod => availableMethod.method === method);
        
        this.debug('Method options %O', paramMethod);
        this.debug('Request params %O', params);
        
        if(apiMethod.availableParams[method]){
          let paramsArray = [];
          
          params.forEach(prm => {
            if(typeof prm === 'string'){
              paramsArray.push(prm);
            } else {
              Object.keys(prm).forEach(prm2 => {
                paramsArray.push(prm2);
              });
            }
          });
          
          let notFoundParams = [];
          
          paramsArray.forEach(prm => {
            if(!apiMethod.availableParams[method].includes(prm)){
              this.debug('Parameter %s not found for %s (%s)', prm, method, version);
              notFoundParams.push(prm);
            }
          });
          
          if(notFoundParams.length){
            throw new Error('Requested Parameter (' + notFoundParams.toString() + ') could not be found!');
          }
            
        }
        
      }
   
    } else {
   
      throw new Error('Requested method (%s) could not be found!', method);
      
    }
    
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
      let resolvedData = this.resolveMethods(data, id);
      
      this._methods.push({ 
        endpoint: this.protocol, 
        version: id, 
        availableMethods: resolvedData.availableMethods, 
        availableParams: resolvedData.availableParams, 
        methods: resolvedData.methods 
      });
    }
    
    this.initialized = true;
    
    return this._methods;

  }

  async invoke(method, version, params, turnOn) {
    
    params = params ? [params] : [];
    version = version || '1.0';
  
    if(!this.initialized){
      this.debug('Method types not initialized yet. Initializing available method types before continue');
      await this.getMethodTypes();
    }
    
    this.checkApiMethod(method, version, params);
    
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
  
  async invokeMethods(method, version, params, turnOn) {
    
    params = params ? [params] : [];
    version = version || '1.0';

    this.debug('Executing action ' + method + ' (' + version + ')');
    
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
