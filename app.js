const { HomeyAPI } = require('homey-api');
const Homey = require('homey');


// Generate a unique ID for each action
let uniqueIdCounter = 0;  // In-memory counter to avoid duplicate simultaneous actions
function generateUniqueId() {
  uniqueIdCounter += 1;  // Increment the counter
  return uniqueIdCounter;  // Return the unique ID
}
// Memory management and helper functions
const memoryValuesDimmy = {};

// Store a value in memory with a key
function SetInMemoryDimmy(key, value) {
  memoryValuesDimmy[key] = value;
}

// Retrieve a value from memory using a key
function GetInMemoryDimmy(key) {
  return memoryValuesDimmy[key];
}

// calculate target brightness based on Lux
function calculateTargetBrightness(reverseLux, luxCurrent, luxThreshold, brightnessMin, brightnessMax) {
  let scale;
  if (reverseLux === 0) {
      // Originele berekening: lagere lux = hogere brightness
      scale = (luxThreshold - luxCurrent) / luxThreshold;
  } else {
      // Omgekeerde berekening: lagere lux = lagere brightness
      scale = luxCurrent / luxThreshold;
  }

  let targetBrightness = brightnessMin + (brightnessMax - brightnessMin) * scale;
  targetBrightness = Math.max(0, Math.min(brightnessMax, targetBrightness));
  return Math.round(targetBrightness) / 100;
}

// Helper function to sleep for a given duration in milliseconds
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// calculate target brightness based on Lux
function calculateTargetBrightness(reverseLux, luxCurrent, luxThreshold, brightnessMin, brightnessMax) {
  let scale;
  if (reverseLux === 0) {
      // Originele berekening: lagere lux = hogere brightness
      scale = (luxThreshold - luxCurrent) / luxThreshold;
  } else {
      // Omgekeerde berekening: lagere lux = lagere brightness
      scale = luxCurrent / luxThreshold;
  }

  let targetBrightness = brightnessMin + (brightnessMax - brightnessMin) * scale;
  targetBrightness = Math.max(0, Math.min(brightnessMax, targetBrightness));
  return Math.round(targetBrightness) / 100;
}

// Helper function to sleep for a given duration in milliseconds
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


async function dimDevicesAndTemperatureInSync(homeyAPI, helpers, devices, targetBrightness, targetTemperature, setDuration) {
  const { generateUniqueId, SetInMemoryDimmy, GetInMemoryDimmy } = helpers;
  const hasTemperature = targetTemperature !== null;
  const stepDuration = 410;
  const totalDuration = setDuration * 1000;
  const steps = Math.max(Math.round(totalDuration / stepDuration), 1);
  const actualStepDuration = totalDuration / steps;

  const devicesInfo = await Promise.all(devices.map(async (device) => {
    const currentDevice = await homeyAPI.devices.getDevice({ id: device.id });
    const deviceid = currentDevice.id;

    let currentOnOffState = currentDevice.capabilitiesObj.onoff.value;
    let currentBrightness = currentOnOffState ? currentDevice.capabilitiesObj.dim.value || 0 : 0;
    let currentTemperature = hasTemperature ? (currentDevice.capabilitiesObj.light_temperature?.value || 0) : null;

    const currentToken = generateUniqueId();
    SetInMemoryDimmy(deviceid, currentToken);

    // Eerst controleren of de aan/uit status moet wijzigen
    if (currentOnOffState !== (targetBrightness > 0)) {
      return {
        currentDevice,
        currentBrightness,
        hasTemperature,
        currentTemperature,
        currentOnOffState,
        currentToken,
        deviceid,
        skip: false
      };
    }

    // Controleer of brightness of temperature aangepast moet worden
    if (currentBrightness !== targetBrightness || (targetBrightness > 0 && hasTemperature && currentTemperature !== targetTemperature)) {
      console.log('slecht')
      return {
        currentDevice,
        currentBrightness,
        hasTemperature,
        currentTemperature,
        currentOnOffState,
        currentToken,
        deviceid,
        skip: false
      };
    }

    // Als er geen aanpassingen nodig zijn
    return { skip: true };
  }));

  const devicesToUpdate = devicesInfo.filter(info => !info.skip);
  if (devicesToUpdate.length === 0) return;

  // Initiële setup voor apparaten die aan moeten
  if (targetBrightness > 0) {
    const initialPromises = devicesToUpdate
      .filter(({ currentOnOffState }) => !currentOnOffState)
      .map(({ currentDevice }) => Promise.all([
        currentDevice.setCapabilityValue('onoff', true),
        currentDevice.setCapabilityValue('dim', 0.01)
      ]));

    if (initialPromises.length > 0) {
      await Promise.all(initialPromises);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  const stepBrightnessMap = devicesToUpdate.map(({ currentBrightness }) => 
    (targetBrightness - currentBrightness) / steps);

  const stepTemperatureMap = hasTemperature ? 
    devicesToUpdate.map(({ currentTemperature }) => 
      (targetTemperature - currentTemperature) / steps)
    : null;

  const startTime = Date.now();

  for (let currentStep = 0; currentStep < steps; currentStep++) {
    const stepStartTime = Date.now();
    const allOperations = [];

    devicesToUpdate.forEach((info, index) => {
      const { currentDevice, currentToken, deviceid } = info;

      if (GetInMemoryDimmy(deviceid) !== currentToken) return;

      let newBrightness = info.currentBrightness + stepBrightnessMap[index] * (currentStep + 1);
      newBrightness = Math.max(0.01, parseFloat(newBrightness.toFixed(2)));

      if (hasTemperature) {
        let newTemperature = info.currentTemperature + stepTemperatureMap[index] * (currentStep + 1);
        newTemperature = parseFloat(newTemperature.toFixed(2));

        allOperations.push(
          currentDevice.setCapabilityValue('dim', newBrightness),
          currentDevice.setCapabilityValue('light_temperature', newTemperature)
        );
      } else {
        allOperations.push(currentDevice.setCapabilityValue('dim', newBrightness));  
      }
    });

    await Promise.all(allOperations);

    const elapsedStepTime = Date.now() - stepStartTime;
    const remainingStepTime = actualStepDuration - elapsedStepTime;

    if (remainingStepTime > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingStepTime));
    }
  }

  // Controleer totale duratie
  const totalElapsed = Date.now() - startTime;
  if (totalElapsed < totalDuration) {
    await new Promise(resolve => setTimeout(resolve, totalDuration - totalElapsed));
  }

  // Finale aanpassingen voor elk device
  for (const { currentDevice, currentToken, deviceid } of devicesToUpdate) {
    if (GetInMemoryDimmy(deviceid) === currentToken) {
      try {
        if (targetBrightness === 0) {
          // Eerst dim naar 0
          await currentDevice.setCapabilityValue('dim', 0);
          // Kleine pauze
          await new Promise(resolve => setTimeout(resolve, 100));
          // Dan uitschakelen
          await currentDevice.setCapabilityValue('onoff', false);
        } else {
          // Zet finale waarden
          await currentDevice.setCapabilityValue('dim', targetBrightness);
          if (hasTemperature) {
            await currentDevice.setCapabilityValue('light_temperature', targetTemperature);
          }
        }
      } catch (error) {
        console.log(`Error setting final state for device ${deviceid}:`, error);
      }
    }
  }
}


// Moved the autocompleteDevices function to app.js to handle device search
async function autocompleteDevices(homeyAPI, query) {
  // Set a timeout promise function
  const timeout = (ms) => new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Request timed out')), ms)
  );

  try {
    // Fetch devices and zones or timeout after 30 seconds (30000ms)
    const [devices, zones] = await Promise.race([
      Promise.all([homeyAPI.devices.getDevices(), homeyAPI.zones.getZones()]),
      timeout(30000)  // Timeout set to 30 seconds
    ]);

    // Filter and map the devices that support dimming and are of class 'light'
    const filteredDevices = Object.values(devices)
      .filter(device => device.capabilities.includes('dim') && device.class === 'light')
      .map(device => ({
        name: device.name,
        id: device.id,
        zone: device.zone,  // Include the zone ID to help with sorting within zones
        type: 'device'  // Adding type to differentiate devices from zones
      }));

    // Filter zones with dimmable devices
    const filteredZones = Object.values(zones)
      .map(zone => {
        const zoneDevices = filteredDevices.filter(device => device.zone === zone.id);
        if (zoneDevices.length > 0) {
          // Sort devices within the zone by name
          const sortedZoneDevices = zoneDevices.sort((a, b) => a.name.localeCompare(b.name));
          return {
            name: zone.name + ' (Zone)',
            id: zone.id,
            devices: sortedZoneDevices,
            type: 'zone'  // Adding type to differentiate zones from devices
          };
        }
        return null;
      })
      .filter(zone => zone && zone.name.toLowerCase().includes(query.toLowerCase()))  // Filter based on the search query
      .sort((a, b) => a.name.localeCompare(b.name));  // Sort zones by name

    // Combine filtered zones and devices into one list, showing devices under their respective zone
    let result = [];
    filteredZones.forEach(zone => {
      result.push({ name: zone.name, id: zone.id, type: 'zone' });  // Add zone to the list
      zone.devices.forEach(device => {
        result.push({ name: ' - ' + device.name, id: device.id, type: 'device' });  // Indent device names under the zone
      });
    });

    return result;
  } catch (error) {
    console.log('Error fetching devices or zones:', error);
    return [];
  }
}

class App extends Homey.App {
  async onInit() {
    // Log that the app has been initialized
    this.log('App has been initialized');      

    // Create and cache an instance of the Homey API for later use
    this.homeyAPI = await HomeyAPI.createAppAPI({ homey: this.homey });

    // Load and register the flow cards
    this.registerFlowCards();
  }

  registerFlowCards() {
    const options = { generateUniqueId, SetInMemoryDimmy, GetInMemoryDimmy, sleep, autocompleteDevices, calculateTargetBrightness, dimDevicesAndTemperatureInSync};
    
    // Register the card for changing brightness over duration
    require('./cards/card_Then_ChangeBrightnessOverDuration').register(this.homey, this.homeyAPI, options);
    // Register the card for changing brightness and temperature over duration
    require('./cards/card_Then_ChangeBrightnessAndTemperatureOverDuration').register(this.homey, this.homeyAPI, options);
    // Register the card for changing brightness over duration and LUX
    require('./cards/card_Then_ChangeBrightnessOverDurationAndLux').register(this.homey, this.homeyAPI, options);    
    // Register the card for blinking lights
    require('./cards/card_Then_BlinkLight').register(this.homey, this.homeyAPI, options);    
    // Register the card for changing brightness and temperature over duration and LUX
    require('./cards/card_Then_ChangeBrightnessAndTemperatureOverDurationAndLux').register(this.homey, this.homeyAPI, options); 
    // Register the card for changing brightness over duration and LUX reverse
    require('./cards/card_Then_ChangeBrightnessOverDurationAndLux_Reverse').register(this.homey, this.homeyAPI, options);   
    // Register the card for changing brightness over duration and LUX reverse
    require('./cards/card_Then_ChangeBrightnessAndTemperatureOverDurationAndLux_Reverse').register(this.homey, this.homeyAPI, options);      
  }
}

module.exports = App;