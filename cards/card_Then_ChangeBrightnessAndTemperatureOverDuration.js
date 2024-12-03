async function register(homey, homeyAPI, { generateUniqueId, SetInMemoryDimmy, GetInMemoryDimmy, sleep, autocompleteDevices }) {
  const card_Then_ChangeBrightnessAndTemperatureOverDuration = homey.flow.getActionCard('card_Then_ChangeBrightnessAndTemperatureOverDuration');

  card_Then_ChangeBrightnessAndTemperatureOverDuration
    .registerArgumentAutocompleteListener(
      'selectDimmableDevice',
      autocompleteDevices.bind(null, homeyAPI)
    )
    .registerRunListener(onFlowChangeBrightnessAndTemperatureOverDuration.bind(null, homeyAPI, { generateUniqueId, SetInMemoryDimmy, GetInMemoryDimmy, sleep }));
}

// Helper function to adjust brightness and temperature synchronously with precise timing
async function dimDevicesAndTemperatureInSync(homeyAPI, helpers, devices, targetBrightness, targetTemperature, setDuration) {
  const { generateUniqueId, SetInMemoryDimmy, GetInMemoryDimmy, sleep } = helpers;

  const stepDuration = 333; // Base step duration in milliseconds
  const milisecDuration = setDuration * 1000;
  const steps = Math.max(Math.round(milisecDuration / stepDuration), 1);
  
  const devicesInfo = await Promise.all(devices.map(async (device) => {
    const currentDevice = await homeyAPI.devices.getDevice({ id: device.id });
    const deviceid = currentDevice.id;
    if (setDuration == 0){
      await currentDevice.setCapabilityValue('dim', targetBrightness);
      await currentDevice.setCapabilityValue('light_temperature', targetTemperature);   
      return { skip: true, deviceid, currentDevice };
    }
    let currentBrightness = currentDevice.capabilitiesObj.dim.value || 0;
    let currentTemperature = currentDevice.capabilitiesObj.light_temperature?.value || 0;
    let currentOnOffState = currentDevice.capabilitiesObj.onoff.value;
    if (currentOnOffState == false){currentBrightness = 0;} //if device is off then start from 0


    const currentToken = generateUniqueId();
    SetInMemoryDimmy(deviceid, currentToken);

    if (targetBrightness > 0){
      TargettOnOffState = true;
    } else{
      TargettOnOffState = false;
    }

    // **Check if the current brightness and temperature already match the target values**
    if (currentBrightness === targetBrightness && currentTemperature === targetTemperature && currentOnOffState === TargettOnOffState) {
      // Skip the loop if the values are already correct
      return { skip: true, deviceid, currentDevice, currentOnOffState };
    }

    return {
      currentDevice,
      currentBrightness,
      currentTemperature,
      currentOnOffState,
      currentToken,
      deviceid,
    };
  }));

  // Filter out devices that should be skipped (already at the correct values)
  const devicesToUpdate = devicesInfo.filter(info => !info.skip);

  if (devicesToUpdate.length === 0) {
    // If all devices were skipped, we can return early
    return;
  }

  const stepBrightnessMap = devicesToUpdate.map(({ currentBrightness }) => (targetBrightness - currentBrightness) / steps);
  const stepTemperatureMap = devicesToUpdate.map(({ currentTemperature }) => (targetTemperature - currentTemperature) / steps);

  for (let currentStep = 0; currentStep < steps; currentStep++) {
    const promises = devicesToUpdate.map(async (info, index) => {
      const { currentDevice, currentToken, deviceid, currentBrightness, currentTemperature } = info;
      const stepBrightness = stepBrightnessMap[index];
      const stepTemperature = stepTemperatureMap[index];

      if (GetInMemoryDimmy(deviceid) !== currentToken) {
        return; // Skip if a new action has started
      }

      let newBrightness = currentBrightness + stepBrightness * (currentStep + 1);
      let newTemperature = currentTemperature + stepTemperature * (currentStep + 1);
      newBrightness = parseFloat(newBrightness.toFixed(2)); // Round to 2 decimals
      newTemperature = parseFloat(newTemperature.toFixed(2));

      await currentDevice.setCapabilityValue('dim', newBrightness);
      await currentDevice.setCapabilityValue('light_temperature', newTemperature);
    });

    await Promise.all(promises);
  }

  await Promise.all(devicesToUpdate.map(async ({ currentDevice, currentBrightness, currentTemperature, currentToken, deviceid, currentOnOffState }) => {
    if (GetInMemoryDimmy(deviceid) === currentToken) {
      if (currentBrightness !== targetBrightness) {
        await currentDevice.setCapabilityValue('dim', targetBrightness);
      }
      if (currentTemperature !== targetTemperature) {
        await currentDevice.setCapabilityValue('light_temperature', targetTemperature);
      }

      if (targetBrightness === 0 && currentOnOffState) {
        await currentDevice.setCapabilityValue('onoff', false);
      }
    }
  }));
}

// Main function to handle flow logic for brightness and temperature based on user input
async function onFlowChangeBrightnessAndTemperatureOverDuration(homeyAPI, helpers, args) {
  const { generateUniqueId, SetInMemoryDimmy, GetInMemoryDimmy, sleep } = helpers;
  try {
    const { selectDimmableDevice, setDuration, setBrightness, setTemperature } = args;

    let targetBrightness = setBrightness / 100;
    let targetTemperature = setTemperature / 100;

    if (selectDimmableDevice.type === 'zone') {
      const devices = await homeyAPI.devices.getDevices();
      const zoneDevices = Object.values(devices).filter(device =>
        device.zone === selectDimmableDevice.id && device.capabilities.includes('dim') && device.capabilities.includes('light_temperature') && device.class === 'light'
      );

      if (zoneDevices.length === 0) {
        throw new Error(`No dimmable devices found in the selected zone: ${selectDimmableDevice.name}`);
      }

      await dimDevicesAndTemperatureInSync(homeyAPI, helpers, zoneDevices, targetBrightness, targetTemperature, setDuration);
    } else {
      await dimDevicesAndTemperatureInSync(homeyAPI, helpers, [selectDimmableDevice], targetBrightness, targetTemperature, setDuration);
    }

    return true;
  } catch (error) {
    console.log('Error running flow action:', error);
    return false;
  }
}

module.exports = {
  register
};