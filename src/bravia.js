'use strict';

const axios = require('axios');
const base64 = require('base-64');
const parseString = require('xml2js').parseString;
const { prompt } = require('enquirer');  
const SsdpClient = require('node-ssdp').Client;
const URL = require('url');
const wol = require('wake_on_lan'); 

const debug = require('debug');
const braviaDebug = debug('bravia');
const requestDebug = debug('bravia:request');
const discoveryDebug = debug('bravia:discovery');

const ServiceProtocol = require('./service-protocol');

const SSDP_SERVICE_TYPE = 'urn:schemas-sony-com:service:IRCC:1';
//urn:schemas-sony-com:service:ScalarWebAPI:1
const SERVICE_PROTOCOLS = [
  'accessControl',
  'appControl',
  'audio',
  'avContent',
  'browser',
  'cec',
  'encryption',
  'guide',
  'recording',
  'system',
  'videoScreen'
];

const DEFAULT_TIME_BETWEEN_COMMANDS = 350;
const TIMEOUT = (ms) => new Promise((res) => setTimeout(res, ms)); 

class Bravia {
  constructor(options) {
  
    this.host = options.host;
    this.mac = options.mac;
    this.port = options.port || 80;
    this.timeout = options.timeout && options.timeout < 1000
      ? options.timeout * 1000
      : 5000;
    
    this.psk = options.psk;
    this.authWithPIN = options.pin;
    
    if(!this.psk && !this.authWithPIN)
      this.authWithPIN = true;
      
    this.credentials = {
      name: options.name,
      uuid: options.uuid,
      token: options.token,
      expires: false
    };
    
    this.protocols = SERVICE_PROTOCOLS;
    this.delay = DEFAULT_TIME_BETWEEN_COMMANDS;

    for (let key in this.protocols) {
      braviaDebug('Creating service /' + this.protocols[key]);
      let protocol = this.protocols[key];
      this[protocol] = new ServiceProtocol(this, protocol);
    }

    this._url = `http://${this.host}:${this.port}/sony`;
    
    braviaDebug('Using url %s', this._url);
    
    if(this.psk)
      braviaDebug('Using PSK (%s) for authentication.', this.psk);
      
    if(this.authWithPIN)
      braviaDebug('Using PIN for authentication %O', this.credentials);
    
    this._codes = [];
    this._methods = [];
  }

  async discover(timeout) {
  
    let ssdp = new SsdpClient();
    let discovered = [];
  
    ssdp.on('response', async (headers, statusCode, data) => {
      if (statusCode === 200) {
        try {
          const response = await axios(headers.LOCATION);
          if(response.status === 200){
            parseString(response.data, (err, result) => {
              if (!err) {
                try {
                  let device = result.root.device[0];
                  if (device.serviceList) {  // Not all devices return a serviceList (e.g. Philips Hue gateway responds without serviceList)
                    let service = device.serviceList[0].service
                      .find(service => service.serviceType[0] === SSDP_SERVICE_TYPE);
                    let api = URL.parse(service.controlURL[0]);
                    discovered.push({
                      host: api.host,
                      port: (api.port || 80),
                      friendlyName: device.friendlyName[0],
                      manufacturer: device.manufacturer[0],
                      manufacturerURL: device.manufacturerURL[0],
                      modelName: device.modelName[0],
                      UDN: device.UDN[0],
                      services: device.serviceList[0].service,
                      scalar: device['av:X_ScalarWebAPI_DeviceInfo'],
                      ircc: device['av:X_IRCC_DeviceInfo'],
                      codes: device['av:X_IRCCCodeList']
                    });
                  }
                } catch(e) {
                  failed(new Error(`Unexpected or malformed discovery response: ${result}.`));
                }
              } else {
                failed(new Error(`Failed to parse the discovery response: ${response.data}.`));
              }
            });
          } else {
            failed(new Error(`Error retrieving the description metadata for device ${data.address}.`));
          }
        } catch(error){
          failed(new Error(`Error retrieving the description metadata for device ${data.address}.`));
        }
      }
    });
    
    discoveryDebug('Starting discovery.');
   
    ssdp.search(SSDP_SERVICE_TYPE);

    let failed = error => {
      ssdp.stop();
      throw error;
    };
    
    await TIMEOUT((timeout*1000||5000));
    
    discoveryDebug('Timeout (%ds) reached. Stopping discovery.', timeout);
    discoveryDebug('Found %d devices', discovered.length);
   
    ssdp.stop();
    
    return discovered;

  }

  async getIRCCCodes() {
  
    if (this._codes.length > 0) {
      return this._codes;
    }
  
    this._codes = await this.system.invoke('getRemoteControllerInfo');
    
    return this._codes;
          
  }
  
  async getAllMethodTypes(){
  
    if (this._methods.length > 0) {
      return this._methods;
    }
  
    for(const key of this.protocols){
      
      try {
      
        let data = await this[key].getMethodTypes();
        this._methods.push(data);
      
      } catch(err) {
      
        this._methods.push([{ endpoint: key, version: false, methods: [] }]);
      
      }
    
    }
    
    return this._methods;
  
  }

  async send(codes, delay) {
  
    delay = delay ? delay : this.delay;
  
    if (typeof codes === 'string') {
      codes = [codes];
    }
    
    let sendCmd = async code => {
    
      let body = `<?xml version="1.0"?>
        <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
            <s:Body>
                <u:X_SendIRCC xmlns:u="urn:schemas-sony-com:service:IRCC:1">
                    <IRCCCode>${code}</IRCCCode>
                </u:X_SendIRCC>
            </s:Body>
        </s:Envelope>`;

      await this._request({
        path: '/IRCC',
        body: body
      });
      
      return;
      
    };
    
    for(const code of codes){
    
      if (/^[A]{5}[a-zA-Z0-9]{13}[\=]{2}$/.test(code)) {
        await sendCmd(code);
      } else {
        const response = this.getIRCCCodes();
        let ircc = response.find(ircc => ircc.name === code);
        if (!ircc) {
          return new Error(`Unknown IRCC code ${code}.`);
        }
        await sendCmd(ircc.value);
      }
      
      if(codes.length > 1)
        TIMEOUT(delay);
    
    }
    
    return;
    
  }
  
  wake(address, options, overWOL){
    return new Promise((resolve, reject) => {
      if(!overWOL){
        this.system
          .invoke('setPowerStatus', '1.0', { 'status': true })
          .then(() => {
            resolve();
          })
          .catch(err => {
            reject(err);
          });
      } else {
        address = address || this.mac;
        options = options ? options : {};
        if(/^([0-9A-F]{2}[:-]){5}([0-9A-F]{2})$/.test(address)){
          options = {
            address: options.address || '255.255.255.255',
            num_packets: options.num_packets || 10,
            interval: options.interval || 100
          };
          
          requestDebug('Sending magic packets to %s', address);
          requestDebug('WOL Options %O', options);
          
          wol.wake(address, options, function(error) {
            if(error) return reject(error);
            resolve('Magic packets send to ' + address);
          });
        } else {
          reject(new Error('No valid MAC addresss'));
        }
      }
    });
  }
  
  sleep(){
    return new Promise((resolve, reject) => {
      this.system
        .invoke('setPowerStatus', '1.0', { 'status': false })
        .then(() => {
          resolve();
        })
        .catch(err => {
          reject(err);
        });
    });
  }
  
  async pair(user, pin, refresh){
    
    try { 
    
      user = user ? user : {};
      
      user.name = user.name || 'Bravia';
      user.uuid = user.uuid || this.genUUID();
      
      requestDebug('Credentials %O', user);
       
      const headers = {};
       
      if(!refresh){
      
        if(pin){
          
          requestDebug('Using PIN (%s) for authentication', pin);
         
          headers.Authorization = 'Basic ' + base64.encode(':' + pin);
         
        } else if(this.token) {
          
          requestDebug('Using Token (%s) for authentication', this.token);
         
          headers.Cookie = this.token;
         
        }
    
      } else {
        
        requestDebug('Refreshing token with given credentials %O', this.credentials);
        
      }
        
      const post_data = `{
        "id": 8,
        "method": "actRegister",
        "version": "1.0",
        "params": [
          {
            "clientid":"${user.name}:${user.uuid}",
            "nickname":"${user.name}"
          },
          [
            {
              "clientid":"${user.name}:${user.uuid}",
              "value":"yes",
              "nickname":"${user.name}",
              "function":"WOL"
            }
          ]
        ]
      }`;  
       
      const response = await axios.post(this._url + '/accessControl', post_data, { headers: headers });
       
      if(response.headers['set-cookie']){
    
        let credentials = {
          name: user.name,
          uuid: user.uuid,
          token: response.headers['set-cookie'][0].split(';')[0].split('auth=')[1],
          expires: response.headers['set-cookie'][0].split(';')[3].split('Expires=')[1]
        };
        
        requestDebug('New token %s', credentials.token);
    
        return credentials;
    
      } else if(response.data && response.data.error && (response.data.error.includes(40005) || response.data.error.includes('Display Is Turned off') || response.data.error.includes('not power-on'))){
      
        throw new Error('Please turn on TV to handle authentication process through PIN.');
       
      } else {
       
        throw response.data;
       
      }
     
    } catch(error) {
     
      if(error.response && error.response.status === 401){
      
        const response = await prompt({
          type: 'input',
          name: 'pin',
          message: 'Please enter the four-digit PIN.'
        });
        
        return this.pair(user, response.pin);
      
      } else {
    
        throw error;
    
      }
     
    }
  
  }

  async _request(opts) {
  
    const options = {
      timeout: this.timeout,
      url: this._url + opts.path,
      method: 'post',
      data: opts.json || opts.body,
      headers: {
        'Content-Type': 'text/xml; charset=UTF-8',
        'SOAPACTION': '"urn:schemas-sony-com:service:IRCC:1#X_SendIRCC"'
      } 
    }; 
    
    requestDebug('Initializing request for %s', options.url);
    requestDebug('Request data %O', options.data);
    
    try {
    
      if(this.authWithPIN){
      
        if(!this.credentials.name && !this.credentials.uuid){
          this.credentials = await this.pair();
        } else {
          this.credentials = await this.pair(this.credentials, false, true);
        }
      
        options.headers.Cookie = 'auth=' + this.credentials.token;
        
      } else {
      
        options.headers['X-Auth-PSK'] = this.psk;
     
      }
      
      requestDebug('Request options %O', options.headers);
      
      if(opts.turnOn){
        requestDebug('Additional request parameter: turnOnTv for request (true)');
        await this.wake();
        await TIMEOUT(2000);
      }
      
      let response = await axios(options);
      
      if(response.status !== 200){
        if(response.data.error){
          throw new Error(response.data.error[1]);
        } else {
          parseString(response.data, (err, result) => {
            if (!err) {
              try {
                throw new Error(result['s:Envelope']['s:Body'][0]['s:Fault'][0]['detail'][0]['UPnPError'][0]['errorDescription'][0]);
              } catch (e) {
                throw new Error(`Unexpected or malformed error response: ${result}.`);
              }
            } else {
              throw new Error(`Failed to parse the error response: ${response.data}.`);
            }
          });
        }
      }
      
      if(response.data.error) {
        if(response.data.error.includes(7) && response.data.error.includes('Illegal State')){
          response.data.result = [{
            source: 'application',
            title: 'App',
            uri: false
          }];
        } else {
          throw response.data.error;
        }
      }
      
      return response;
    
    } catch(error) {
    
      if (error.response) {
        throw (`Response error, status code: ${error.response.status}.`);
      } else {
        throw error;
      } 
    
    }
    
  }
  
  genUUID () {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0; var v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
  
}

module.exports = Bravia;
