const { HomeyAPI } = require('homey-api');
const Homey = require('homey');
const _ = require("lodash");
const memoryValuesDimmy = {};


_.SetInMemoryDimmy = function(key, value) {
  memoryValuesDimmy[key] = value;
}

_.GetInMemoryDimmy = function(key) {
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
      .registerRunListener(this._onFlowSingleDimmyRun.bind(this)); // Register the run listener
  }

  async _autocompleteDevices(query) {
    try {
      // Fetch and filter devices with dim capability and class 'light'
      const lamps = await this._getDimmableLights();

      // Filter the results based on the query
      return lamps.filter(lamp => lamp.name.toLowerCase().includes(query.toLowerCase()));
    } catch (error) {
      this.log('Error fetching devices:', error);
      return [];
    }
  }

  async _getDimmableLights() {
    // Fetch all devices using the HomeyAPI and filter directly
    const devices = await this.homeyAPI.devices.getDevices();

    return Object.values(devices).filter(device =>
      device.capabilities.includes('dim') && device.class === 'light'
    ).map(device => ({
      name: device.name,
      id: device.id
    }));
  }


  async _onFlowSingleDimmyRun(args) {
    try {
        const { flowSingleDimmyArgument, flowDimLevel, flowDimDuration } = args;
        const device = await this.homeyAPI.devices.getDevice({ id: flowSingleDimmyArgument.id });

        const currentDimValue = device.capabilitiesObj.dim.value || 0;
        const currentOnOffState = device.capabilitiesObj.onoff.value;
        const targetDimValue = flowDimLevel / 100;

        const currentToken = _.uniqueId();
        _.SetInMemoryDimmy(device.id, currentToken);

        const stepDuration = 333; // Duration of each step in milliseconds
        const steps = Math.max(Math.round(flowDimDuration * 1000 / stepDuration), 1); // Number of steps
        const dimStep = (targetDimValue - currentDimValue) / steps;

                // Eerste stap: check of het apparaat moet worden ingeschakeld
        if (targetDimValue > 0 && !currentOnOffState) {
              await device.setCapabilityValue('dim', 0.01);
              await device.setCapabilityValue('onoff', true);
        }


        if (device.capabilitiesObj.dim && device.capabilitiesObj.dim.options && device.capabilitiesObj.dim.options.duration) {
            // Set default (Homey) dim level for the selected device with a transition duration
            await device.setCapabilityValue('dim', targetDimValue, { duration: flowDimDuration * 1000 });
        } else {
            let currentValue = currentDimValue;

            for (let currentStep = 0; currentStep < steps; currentStep++) {
                currentValue += dimStep;

                // Set the dim level || Break the loop if the target value is reached || Controleer of de waarde de doelwaarde overschrijdt
                if (_.GetInMemoryDimmy(device.id) > currentToken || currentValue === targetDimValue || Math.abs(currentValue - targetDimValue) < Math.abs(dimStep)) {
                  device.setCapabilityValue('dim', targetDimValue);  
                  break;
                }
                
                 device.setCapabilityValue('dim', currentValue);

                await this._sleep(stepDuration);
            }
        }

        // Buiten de loop: check of het apparaat moet worden uitgeschakeld
        if (targetDimValue === 0 && currentOnOffState) {
            await device.setCapabilityValue('onoff', false);
        }

        return true;
    } catch (error) {
        this.log('Error running flow action:', error);
        return false;
    }
}

// Helper function to sleep for a given duration
_sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
}

module.exports = App;