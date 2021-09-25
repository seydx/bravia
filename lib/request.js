'use-strict';

const debug = require('debug')('bravia:request');
const got = require('got');
const parseString = require('xml2js').parseStringPromise;

exports.request = async (uri, credentials, data, headers, pair) => {
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=UTF-8',
      SOAPACTION: '"urn:schemas-sony-com:service:IRCC:1#X_SendIRCC"',
    },
  };

  if (data.xml) {
    options.body = data.xml;
    options.responseType = 'text';
  } else {
    options.json = data;
    options.responseType = 'json';
  }

  if (credentials.psk) {
    options.headers['X-Auth-PSK'] = credentials.psk;
  } else if (credentials.pin && credentials.pin.token) {
    options.headers.Cookie = `auth=${credentials.pin.token}`;
  }

  options.headers = {
    ...options.headers,
    ...headers,
  };

  debug(`Initializing request for ${uri}`);
  debug('Request %O', options);

  try {
    const response = await got(uri, options);
    response.body.turnedOff = null;

    //The “error” member must be an array and is defined as [error_code, error_message].
    //Error List: https://pro-bravia.sony.net/develop/integrate/rest-api/spec/errorcode-list/index.html
    const error = response.body.error;

    if (error) {
      if (error[1] === 'Illegal State') {
        response.body.result = [
          {
            uri: false,
            source: 'application',
            title: 'Application',
          },
        ];

        delete response.body.error;
      } else if (error[0] === 40005 || error[1] === 'Display Is Turned off' || error[1] === 'not power-on') {
        response.body.result = error;
        response.body.turnedOff = true;

        delete response.body.error;
      } else {
        const err = {
          response: {
            statusCode: error[0],
            statusMessage: error[1],
            body: '',
            url: response.url,
          },
        };

        throw err;
      }
    }

    //"response.body.result" must be an array type of fixed length. (The length is defined on each API specification.)
    return pair ? response : response.body;
  } catch (err) {
    if (err.response) {
      let error = new Error(`${err.response.statusCode} - ${err.response.statusMessage}`);
      let soapError = {};

      try {
        const result = await parseString(err.response.body);

        soapError = {
          errorCode: result['s:Envelope']['s:Body'][0]['s:Fault'][0].detail[0].UPnPError[0].errorCode[0],
          errorDescription: result['s:Envelope']['s:Body'][0]['s:Fault'][0].detail[0].UPnPError[0].errorDescription[0],
        };
      } catch {
        //unhandled
      }

      Object.assign(error, {
        title: 'Invalid Response',
        code: err.response.statusCode,
        message: err.response.statusMessage,
        soap: soapError,
        payload: {
          id: data.id,
          version: data.version,
          method: data.method,
          params: data.params && data.params.length ? data.params[0] : [],
        },
        url: err.response.url,
      });

      throw error;
    } else if (err.request) {
      let error = new Error(`${err.code} - ${err.message}`);

      Object.assign(error, {
        title: 'No Response',
        code: err.code,
        message: err.message,
        soap: {},
        payload: {
          id: data.id,
          version: data.version,
          method: data.method,
          params: data.params && data.params.length ? data.params[0] : [],
        },
        url: err.request.requestUrl,
      });

      throw error;
    } else {
      throw new Error(err);
    }
  }
};
