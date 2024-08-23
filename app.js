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
        const currentToken = _.uniqueId();
        const { flowSingleDimmyArgument, flowDimLevel, flowDimDuration } = args;
        // Retrieve the selected device by ID
        const device = await this.homeyAPI.devices.getDevice({ id: flowSingleDimmyArgument.id });

        // if duration = 0 then set instant 
        if (flowDimDuration === 0) {
          await device.setCapabilityValue('dim', (flowDimLevel/100));
          return true;
      }
        
        await _.SetInMemoryDimmy(device.id, currentToken);
        if (!device) throw new Error('Device not found');
        
        const currentDimValue = device.capabilitiesObj.dim.value || 0;
        const targetDimValue = flowDimLevel / 100;
        const stepDuration = 250; // Duration of each step in milliseconds
        const steps = Math.round(flowDimDuration * 1000 / stepDuration); // Number of steps
        const dimStep = (targetDimValue - currentDimValue) / steps;

        if (device.capabilitiesObj.dim && device.capabilitiesObj.dim.options && device.capabilitiesObj.dim.options.duration) { 
            // Set default (Homey) dim level for the selected device with a transition duration
            await device.setCapabilityValue('dim', targetDimValue, { duration: flowDimDuration * 1000 });
        } else {
            // Custom loop for devices that don't support transition duration
            let currentStep = 0;
            let currentValue = currentDimValue;

            while (currentStep < steps) {
                currentValue += dimStep;
                currentStep++;

                // Ensure we don't exceed the target value due to rounding errors
                if ((dimStep > 0 && currentValue > targetDimValue) || (dimStep < 0 && currentValue < targetDimValue)) {
                    currentValue = targetDimValue;
                }
                // Set the dim level
                if (_.GetInMemoryDimmy(device.id) > currentToken){
                    break;
                }  
                  await device.setCapabilityValue('dim', currentValue);

                // Wait for the next step
                await this._sleep(stepDuration);
            }
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