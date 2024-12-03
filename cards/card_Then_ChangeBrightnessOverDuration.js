async function register(homey, homeyAPI, { generateUniqueId, SetInMemoryDimmy, GetInMemoryDimmy, sleep, autocompleteDevices}) {
  const card_Then_ChangeBrightnessOverDuration = homey.flow.getActionCard('card_Then_ChangeBrightnessOverDuration');

  card_Then_ChangeBrightnessOverDuration
    .registerArgumentAutocompleteListener(
      'selectDimmableDevice',
      autocompleteDevices.bind(null, homeyAPI)
    )
    .registerRunListener(onFlowChangeBrightnessOverDuration.bind(null, homeyAPI, { generateUniqueId, SetInMemoryDimmy, GetInMemoryDimmy, sleep }));
}

// Helper function to dim all devices in sync with precise timing
async function dimDevicesInSync(homeyAPI, helpers, devices, targetBrightness, setDuration) {
  const { generateUniqueId, SetInMemoryDimmy, GetInMemoryDimmy, sleep } = helpers;

  const stepDuration = 410; // Base step duration in milliseconds
  const milisecDuration = setDuration * 1000;
  const steps = Math.max(Math.round(milisecDuration / stepDuration), 1);

  const devicesInfo = await Promise.all(devices.map(async (device) => {
    const currentDevice = await homeyAPI.devices.getDevice({ id: device.id });
    const deviceid = currentDevice.id;
    if (setDuration == 0){
      await currentDevice.setCapabilityValue('dim', targetBrightness);
      return;
    }
    let currentBrightness = currentDevice.capabilitiesObj.dim.value || 0;
    let currentOnOffState = currentDevice.capabilitiesObj.onoff.value;
    if (currentOnOffState == false){currentBrightness = 0;} //if device is off then start from 0

    if (targetBrightness > 0 && !currentOnOffState) {
      await currentDevice.setCapabilityValue('onoff', true);
      await currentDevice.setCapabilityValue('dim', 0.01);  // Start with a minimal brightness value
    }

    const currentToken = generateUniqueId();
    SetInMemoryDimmy(deviceid, currentToken);

    return {
      currentDevice,
      currentBrightness,
      currentToken,
      deviceid,
    };
  }));

  const stepBrightnessMap = devicesInfo.map(({ currentBrightness }) => (targetBrightness - currentBrightness) / steps);

  for (let currentStep = 0; currentStep < steps; currentStep++) {
    const promises = devicesInfo.map(async (info, index) => {
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
  }

  // Ensure the final brightness value is set
  await Promise.all(devicesInfo.map(async ({ currentDevice, currentToken, deviceid }) => {
    if (GetInMemoryDimmy(deviceid) === currentToken) {
      await currentDevice.setCapabilityValue('dim', targetBrightness);
    }
  }));
}

// Adjust the main function to call dimDevicesInSync for each device
async function onFlowChangeBrightnessOverDuration(homeyAPI, helpers, args) {
  const { generateUniqueId, SetInMemoryDimmy, GetInMemoryDimmy, sleep } = helpers;
  try {
    const { selectDimmableDevice, setBrightness, setDuration } = args;
    const targetBrightness = setBrightness / 100;

    if (selectDimmableDevice.type === 'zone') {
      const devices = await homeyAPI.devices.getDevices();
      const zoneDevices = Object.values(devices).filter(device =>
        device.zone === selectDimmableDevice.id && device.capabilities.includes('dim') && device.class === 'light'
      );

      if (zoneDevices.length === 0) {
        throw new Error(`No dimmable devices found in the selected zone: ${selectDimmableDevice.name}`);
      }

      // Dim all devices in the zone in sync
      await dimDevicesInSync(homeyAPI, helpers, zoneDevices, targetBrightness, setDuration);
    } else {
      // Dim the individual device in sync
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