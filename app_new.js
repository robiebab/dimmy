const { HomeyAPI } = require('homey-api');
const Homey = require('homey');
const _ = require("lodash");
const memoryValuesDimmy = {};
// test
// Definieer Set en Get functies zonder lodash
function SetInMemoryDimmy(key, value) {
  memoryValuesDimmy[key] = value;
}

function GetInMemoryDimmy(key) {
  return memoryValuesDimmy[key];
}

class App extends Homey.App {
  async onInit() {
    this.log('App has been initialized');

    // Create and cache an instance of the Homey API
    this.homeyAPI = await HomeyAPI.createAppAPI({ homey: this.homey });

    // Register the flow card action
    this._registerFlowCardAction();
  }

  _registerFlowCardAction() {
    const cardActionSingleDimmy = this.homey.flow.getActionCard('flowSingleDimmy');

    cardActionSingleDimmy
      .registerArgumentAutocompleteListener(
        'flowSingleDimmyArgument',
        this._autocompleteDevices.bind(this)
      )
      .registerRunListener(this._ActionCard_ChangeBrightnessLevel.bind(this)); // Register the run listener
  }

  async _autocompleteDevices(query) {
    try {
      // Fetch and filter devices with dim capability and class 'light'
      const devices = await this.homeyAPI.devices.getDevices();

      const lamps = Object.values(devices).filter(device =>
        device.capabilities.includes('dim') && device.class === 'light'
      ).map(device => ({
        name: device.name,
        id: device.id
      }));

      // Filter the results based on the query
      return lamps.filter(lamp => lamp.name.toLowerCase().includes(query.toLowerCase()));
    } catch (error) {
      this.log('Error fetching devices:', error);
      return [];
    }
  }

  async _retrySetCapabilityValue(device, capability, value, maxRetries = 3, delay = 200) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await device.setCapabilityValue(capability, value);
        return true; // Als de actie succesvol is, stop met proberen
      } catch (error) {
        this.log(`Error setting ${capability} to ${value} on attempt ${attempt}:`, error);
        if (attempt < maxRetries) {
          this.log(`Retrying in ${delay}ms...`);
          await this._sleep(delay); // Wacht voordat je het opnieuw probeert
        } else {
          this.log(`Failed to set ${capability} to ${value} after ${maxRetries} attempts.`);
          return false; // Als alle pogingen mislukken, geef false terug
        }
      }
    }
  }

  async _ActionCard_ChangeBrightnessLevel(args) {
    const { device, currentToken, currentOnOffState, currentBrightnessLevel, targetBrightnesslevel, stepDuration, steps, dimStep } = await this._DeviceInformation(args);

    for (let currentStep = 0; currentStep < steps; currentStep++) {

    let  changeBrightnessLevelOutput = await this._ChangeBrightnessLevel(device, currentBrightnessLevel, targetBrightnesslevel, dimStep);

      if (GetInMemoryDimmy(device.id) > currentToken || changeBrightnessLevelOutput == 'Stop') {
        console.log('skip');
        break;
      } else {
        await this._sleep(stepDuration);
      }
    }
  }


  async _DeviceInformation(args) {
    const {
      flowSingleDimmyArgument: targetDevice,
      flowDimLevel: targetBrightness,
      flowDimDuration: targetTotalDuration
    } = args;

    const device = await this.homeyAPI.devices.getDevice({ id: targetDevice.id });
    const currentToken = _.uniqueId();
    SetInMemoryDimmy(device.id, currentToken);

    const stepDuration = 333;
    const currentBrightnessLevel = device.capabilitiesObj.dim.value || 0;
    const currentOnOffState = device.capabilitiesObj.onoff.value;
    const targetBrightnesslevel = targetBrightness / 100;
    const steps = Math.max(Math.round(targetTotalDuration * 1000 / stepDuration), 1); 
    const dimStep = (targetBrightnesslevel - currentBrightnessLevel) / steps;

    return { device, currentToken, currentOnOffState, currentBrightnessLevel, targetBrightnesslevel, stepDuration, steps, dimStep };
  }

  async _ChangeBrightnessLevel(device, currentBrightnessLevel, targetBrightnesslevel, dimStep) {
    let previousBrightnessLevel = currentBrightnessLevel;

    // Declare and initialize rawCurrentBrightnessLevel
    let rawCurrentBrightnessLevel = currentBrightnessLevel; // Start met het huidige helderheidsniveau

    // Pas de dimStap toe
    rawCurrentBrightnessLevel += dimStep;
    currentBrightnessLevel = parseFloat(rawCurrentBrightnessLevel.toPrecision(2));

    console.log('currentBrightnessLevel:', currentBrightnessLevel);
    console.log('targetBrightnesslevel:', targetBrightnesslevel);
    console.log('dimStep:', dimStep);
    console.log('previousBrightnessLevel:', previousBrightnessLevel);



    
    // if (currentBrightnessLevel === targetBrightnesslevel 
    //   || currentBrightnessLevel == previousBrightnessLevel) {
    //     return 'Stop';
    // }

    await device.setCapabilityValue('dim', currentBrightnessLevel);
    this.log(device.id + ` Set brightness level to ${currentBrightnessLevel}`);
    return currentBrightnessLevel;
}

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}


module.exports = App;