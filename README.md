# Sony BRAVIA

Node.js module for discovering and controlling Sony BRAVIA Android TVs. This module allows you retrieve all the available service protocol API methods and invoke any of them. All methods return a [Promise](https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/Promise).

## Setup

### TV Setup

* Turn on your TV
* On the TV go to Settings > Network > Home network setup > Remote device/Renderer > On
* On the TV go to Settings > Network > Home network setup > IP Control > Authentication > Normal and Pre-Shared Key
* On the TV go to Settings > Network > Home network setup > Remote device/Renderer > Simple IP Control > On

**Optional:**

* On the TV go to Settings > Network > Home network setup > Remote device/Renderer > Enter Pre-Shared Key > 0000 (or whatever you want your PSK Key to be)

### Install with NPM

```sudo npm install @seydx/bravia -g ```

## Discovery

```javascript
const Bravia = require('bravia');

async function discover () {
  try {
    // Attempts to discover any Sony Bravia TVs.
    const devices = await Bravia.discover();
    
    for (const device in devices) {
      console.log(devices[device]);
    }
  } catch (error) {
    console.error(error);    
  }
}
```

## Authentication

### Connect to TV via PSK

```javascript
const Bravia = require('bravia');

// Connects to a Bravia TV at 192.168.1.2:80 with the PSK 0000.
const bravia = new Bravia({host: '192.168.1.2', port: 80, psk: '0000'});

```

### Connect to TV via PIN

To use the API with the PIN procedure, your credentials must first be created. Afterwards this credentials can be used to send further requests.


```javascript
// Connects to a Bravia TV at 192.168.1.2:80 and create your credentials.
const Bravia = require('bravia');

const name = 'MyTV'; // Default: '@seydx/bravia'
const bravia = new Bravia({name: name, host: '192.168.1.2', port: 80, pin: true});

async function example(){
  try {
    const credentials = await bravia.pair();
    console.log(credentials)
  } catch(error) {
    console.log(error);
  }
}

```

The PIN displayed on the TV must then be entered in the terminal. This will generate a credentials ``<Object>`` like this:

```javascript
{
  name: 'MyTV',
  uuid: 'e9812807-d394-407c-b657-c89a98804e65',
  token: 'A0B9B9D7580466F22EE8F8EA148863774ACCE203',
  expires: 'Fr., 26 Apr. 2009 21:42:48 GMT+00:00'
}
```

With these credentials u can call the API without any authentication procedure

```javascript
// Connects to a Bravia TV at 192.168.1.2:80 with Application Name and UUID.
const Bravia = require('bravia');

const credentials = {
  name: 'MyTV',
  uuid: 'e9812807-d394-407c-b657-c89a98804e65',
  token: 'A0B9B9D7580466F22EE8F8EA148863774ACCE203',
  expires: 'Fr., 26 Apr. 2009 21:42:48 GMT+00:00'
}

const bravia = new Bravia({host: '192.168.1.2', port: 80, ...credentials});
```

Alternatively, the credentials can also be created using the built-in CLI. See below.


### Command line tool

Alternatively you can create the credentials via the built-in CLI.

The bravia cli support following command:
- **pair**: Pair with an Bravia TV

The bravia cli support following arguments:
- **\<host\>**: The address of your Bravia TV

The bravia cli support following options:
- **-n, --name**: Name for the app (Default Bravia)
- **-p, --port**: The port of your Bravia TV (Default: 80)

**Example usage:**

```
bravia pair 192.168.178.55 -p 80 -n MyTv
```

The PIN displayed on the TV must then be entered in the terminal. This will generate a credentials ``<Object>`` like this:

```javascript
name:  MyTv
uuid:  20879d92-1234-4ba3-a4ce-9a8444c71fa7
token: FD53E55779F964702178CDEBF71E3BA51A6D3A5D
expires: Fr., 26 Apr. 2009 21:42:48 GMT+00:00
```

## Usage

### Service Protocol APIs

```javascript
async function api(){
  try {
    // Retrieves all the system method types and versions.
    const methods = await bravia.describe();
    console.log(methods.body);
    
    // Retrieves all the available IRCC commands from the TV.
    const commands = await bravia.exec('system', 'getRemoteControllerInfo');
    console.log(commands.body);
    
    // Queries the volume info.
    const volume = await bravia.exec('audio', 'getVolumeInformation');
    console.log(volume.body);
    
    // Sets the speaker volume level to 50%.
    await bravia.exec('audio', 'setAudioVolume', '1.0', { target: 'speaker', volume: '50' });
  } catch(error) {
    console.log(error);
  }
}
```


### Send IRCC Code

```javascript
async function ircc(){
  try {
    // Retrieves all the available IRCC commands from the TV.
    const commands = await bravia.getIRCCCodes();
    
    // Sends an IRCC code signal by name.
    await bravia.execCommand('Mute');
    
    // Sends an IRCC code signal by value.
    await bravia.execCommand('AAAAAQAAAAEAAAAUAw==');
    
    // Sends multiple IRCC code signals by name and/or value. Change delay to alter time between each command sent.
    const delay = 350 //in milliseconds (Default: 350)
    
    await bravia.execCommand(['Hdmi1', 'AAAAAgAAABoAAABaAw==', 'Hdmi2', 'AAAAAgAAABoAAABbAw=='], delay);
  } catch(error) {
    console.log(error);
  }
}
```


### Turn on TV

The TV can easily be switched on via "Wake on LAN" or directly through the API. For WOL you need to enable WOL under TV settings.

```javascript
async function turnOnTV(){
  try {
    // Optional (Default values)
    const options = {
      address: '255.255.255.255',
      num_packets: 10,
      interval: 100
    }

    // Turn on TV through Wake on LAN (WOL)
    await bravia.wake('33:7F:62:9F:7B:70', options)
    
    // Turn on TV through API
    await bravia.exec('system', 'setPowerStatus', '1.0', { status: true })
  } catch(error) {
    console.log(error);
  }
}
```
