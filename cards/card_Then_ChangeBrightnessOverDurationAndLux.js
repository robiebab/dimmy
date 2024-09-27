async function register(homey, homeyAPI, { generateUniqueId, SetInMemoryDimmy, GetInMemoryDimmy, sleep, autocompleteDevices }) {
  const card_Then_ChangeBrightnessOverDurationAndLux = homey.flow.getActionCard('card_Then_ChangeBrightnessOverDurationAndLux');

  card_Then_ChangeBrightnessOverDurationAndLux
    .registerArgumentAutocompleteListener(
      'selectDimmableDevice',
      autocompleteDevices.bind(null, homeyAPI)
    )
    .registerRunListener(onFlowChangeBrightnessOverDurationAndLux.bind(null, homeyAPI, { generateUniqueId, SetInMemoryDimmy, GetInMemoryDimmy, sleep }));
}

// Helper function to adjust brightness synchronously with precise timing
async function dimDevicesInSync(homeyAPI, helpers, devices, targetBrightness, setDuration) {
  const { generateUniqueId, SetInMemoryDimmy, GetInMemoryDimmy, sleep } = helpers;

  const stepDuration = 333; // Base step duration in milliseconds
  const milisecDuration = setDuration * 1000;
  const steps = Math.max(Math.round(milisecDuration / stepDuration), 1);

  const totalStartTime = Date.now();

  const devicesInfo = await Promise.all(devices.map(async (device) => {
    const currentDevice = await homeyAPI.devices.getDevice({ id: device.id });
    let currentBrightness = currentDevice.capabilitiesObj.dim.value || 0;
    const currentOnOffState = currentDevice.capabilitiesObj.onoff.value;
    const deviceid = currentDevice.id;

    const currentToken = generateUniqueId();
    SetInMemoryDimmy(deviceid, currentToken);

    // **Check if the current brightness already matches the target value**
    if (currentBrightness === targetBrightness) {
      // Skip the loop if the value is already correct
      return { skip: true, deviceid, currentDevice, currentOnOffState };
    }

    return {
      currentDevice,
      currentBrightness,
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

  for (let currentStep = 0; currentStep < steps; currentStep++) {
    const promises = devicesToUpdate.map(async (info, index) => {
      const { currentDevice, currentToken, deviceid, currentBrightness } = info;
      const stepBrightness = stepBrightnessMap[index];

      if (GetInMemoryDimmy(deviceid) !== currentToken) {
        return; // Skip if a new action has started
      }

      let newBrightness = currentBrightness + stepBrightness * (currentStep + 1);
      newBrightness = parseFloat(newBrightness.toFixed(2)); // Round to 2 decimals

      await currentDevice.setCapabilityValue('dim', newBrightness);
    });

    await Promise.all(promises);

    const elapsedTime = Date.now() - totalStartTime;
    const expectedTime = (currentStep + 1) * stepDuration;
    const remainingTime = expectedTime - elapsedTime;

    await sleep(Math.max(remainingTime, 0));
  }

  await Promise.all(devicesToUpdate.map(async ({ currentDevice, currentBrightness, currentToken, deviceid, currentOnOffState }) => {
    if (GetInMemoryDimmy(deviceid) === currentToken) {
      if (currentBrightness !== targetBrightness) {
        await currentDevice.setCapabilityValue('dim', targetBrightness);
      }

      if (targetBrightness === 0 && currentOnOffState) {
        await currentDevice.setCapabilityValue('onoff', false);
      }
    }
  }));
}

// Main function to handle flow logic for brightness based on lux
async function onFlowChangeBrightnessOverDurationAndLux(homeyAPI, helpers, args) {
  const { generateUniqueId, SetInMemoryDimmy, GetInMemoryDimmy, sleep } = helpers;
  try {
    const { selectDimmableDevice, setDuration, luxValue, luxThreshold, minBrightness, maxBrightness } = args;

    let targetBrightness;

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
        device.zone === selectDimmableDevice.id && device.capabilities.includes('dim') && device.class === 'light'
      );

      if (zoneDevices.length === 0) {
        throw new Error(`No dimmable devices found in the selected zone: ${selectDimmableDevice.name}`);
      }

      await dimDevicesInSync(homeyAPI, helpers, zoneDevices, targetBrightness, setDuration);
    } else {
      await dimDevicesInSync(homeyAPI, helpers, [selectDimmableDevice], targetBrightness, setDuration);
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