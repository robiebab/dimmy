async function register(homey, homeyAPI, { generateUniqueId, SetInMemoryDimmy, GetInMemoryDimmy, sleep, autocompleteDevices }) {
  const card_Then_ChangeBrightnessAndTemperatureOverDurationAndLux = homey.flow.getActionCard('card_Then_ChangeBrightnessAndTemperatureOverDurationAndLux');

  card_Then_ChangeBrightnessAndTemperatureOverDurationAndLux
    .registerArgumentAutocompleteListener(
      'selectDimmableDevice',
      autocompleteDevices.bind(null, homeyAPI)
    )
    .registerRunListener(onFlowChangeBrightnessAndTemperatureOverDurationAndLux.bind(null, homeyAPI, { generateUniqueId, SetInMemoryDimmy, GetInMemoryDimmy, sleep }));
}

// Helper function to adjust brightness and temperature synchronously with precise timing
async function dimDevicesAndTemperatureInSync(homeyAPI, helpers, devices, targetBrightness, targetTemperature, setDuration) {
  const { generateUniqueId, SetInMemoryDimmy, GetInMemoryDimmy, sleep } = helpers;

  const stepDuration = 333; // Base step duration in milliseconds
  const milisecDuration = setDuration * 1000;
  const steps = Math.max(Math.round(milisecDuration / stepDuration), 1);
  
  const totalStartTime = Date.now();

  const devicesInfo = await Promise.all(devices.map(async (device) => {
    const currentDevice = await homeyAPI.devices.getDevice({ id: device.id });
    let currentOnOffState = currentDevice.capabilitiesObj.onoff.value;
    let currentBrightness = currentDevice.capabilitiesObj.dim.value || 0;
    let currentTemperature = currentDevice.capabilitiesObj.light_temperature?.value || 0;
    if (currentOnOffState == false){currentBrightness = 0;} //if device is off then start from 0
    const deviceid = currentDevice.id;

    const currentToken = generateUniqueId();
    SetInMemoryDimmy(deviceid, currentToken);

    // **Check if the current brightness and temperature already match the target values**
    if (currentBrightness === targetBrightness && currentTemperature === targetTemperature) {
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

    const elapsedTime = Date.now() - totalStartTime;
    const expectedTime = (currentStep + 1) * stepDuration;
    const remainingTime = expectedTime - elapsedTime;

    await sleep(Math.max(remainingTime, 0));
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

// Main function to handle flow logic for brightness and temperature based on lux
async function onFlowChangeBrightnessAndTemperatureOverDurationAndLux(homeyAPI, helpers, args) {
  const { generateUniqueId, SetInMemoryDimmy, GetInMemoryDimmy, sleep } = helpers;
  try {
    const { selectDimmableDevice, setDuration, luxValue, luxThreshold, minBrightness, maxBrightness, setTemperature } = args;

    let targetBrightness;
    let targetTemperature = setTemperature / 100;

    if (luxValue >= luxThreshold) {
      targetBrightness = 0; 
    } else if (luxValue === 0) {
      targetBrightness = maxBrightness;
    } else {
      let scale = (luxThreshold - luxValue) / luxThreshold;
      targetBrightness = minBrightness + (maxBrightness - minBrightness) * scale;
    }

    targetBrightness = Math.round(targetBrightness) / 100;

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