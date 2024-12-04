async function register(homey, homeyAPI, { generateUniqueId, SetInMemoryDimmy, GetInMemoryDimmy, sleep, autocompleteDevices }) {
  const card_Then_ChangeBrightnessOverDurationAndLux = homey.flow.getActionCard('card_Then_ChangeBrightnessOverDurationAndLux');

  card_Then_ChangeBrightnessOverDurationAndLux
    .registerArgumentAutocompleteListener(
      'selectDimmableDevice',
      autocompleteDevices.bind(null, homeyAPI)
    )
    .registerRunListener(onFlowChangeBrightnessOverDurationAndLux.bind(null, homeyAPI, { generateUniqueId, SetInMemoryDimmy, GetInMemoryDimmy, sleep }));
}

async function dimDevicesInSync(homeyAPI, helpers, devices, targetBrightness, setDuration) {
  const { generateUniqueId, SetInMemoryDimmy, GetInMemoryDimmy } = helpers;

  const stepDuration = 410;
  const milisecDuration = Math.max(setDuration * 1000, stepDuration);
  const steps = Math.max(Math.round(milisecDuration / stepDuration), 1);

  const devicesInfo = await Promise.all(devices.map(async (device) => {
    const currentDevice = await homeyAPI.devices.getDevice({ id: device.id });
    const deviceid = currentDevice.id;

    let currentOnOffState = currentDevice.capabilitiesObj.onoff.value;
    let currentBrightness = currentDevice.capabilitiesObj.dim.value || 0;

    if (!currentOnOffState) currentBrightness = 0;

    const currentToken = generateUniqueId();
    SetInMemoryDimmy(deviceid, currentToken);

    if (currentBrightness === targetBrightness && 
        currentOnOffState === (targetBrightness > 0)) {
      return { skip: true };
    }

    return {
      currentDevice,
      currentBrightness,
      currentOnOffState,
      currentToken,
      deviceid,
    };
  }));

  const devicesToUpdate = devicesInfo.filter(info => !info.skip);
  if (devicesToUpdate.length === 0) return;

  const initialPromises = devicesToUpdate
    .filter(({ currentOnOffState }) => !currentOnOffState && targetBrightness > 0)
    .map(({ currentDevice }) => Promise.all([
      currentDevice.setCapabilityValue('dim', 0.01),
      currentDevice.setCapabilityValue('onoff', true)
    ]));

  if (initialPromises.length > 0) {
    await Promise.all(initialPromises);
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  const stepBrightnessMap = devicesToUpdate.map(({ currentBrightness }) => 
    (targetBrightness - currentBrightness) / steps);

  for (let currentStep = 0; currentStep < steps; currentStep++) {
    const allOperations = [];

    devicesToUpdate.forEach((info, index) => {
      const { currentDevice, currentToken, deviceid } = info;

      if (GetInMemoryDimmy(deviceid) !== currentToken) return;

      if (currentStep === steps - 1) {
        allOperations.push(currentDevice.setCapabilityValue('dim', targetBrightness));

        if (targetBrightness === 0) {
          allOperations.push(currentDevice.setCapabilityValue('onoff', false));
        }
      } else {
        let newBrightness = info.currentBrightness + stepBrightnessMap[index] * (currentStep + 1);
        newBrightness = parseFloat(newBrightness.toFixed(2));

        allOperations.push(currentDevice.setCapabilityValue('dim', newBrightness));
      }
    });

    await Promise.all(allOperations);
  }
}

async function onFlowChangeBrightnessOverDurationAndLux(homeyAPI, helpers, args) {
  const { generateUniqueId, SetInMemoryDimmy, GetInMemoryDimmy, sleep } = helpers;
  try {
    const { selectDimmableDevice, setDuration, luxValue, luxThreshold, minBrightness, maxBrightness } = args;

    let targetBrightness;

    // Bereken helderheid op basis van lux waarden
    if (luxValue >= luxThreshold) {
      targetBrightness = 0;
    } else if (luxValue === 0) {
      targetBrightness = maxBrightness;
    } else {
      let scale = (luxThreshold - luxValue) / luxThreshold;
      targetBrightness = minBrightness + (maxBrightness - minBrightness) * scale;
      targetBrightness = Math.max(0, Math.min(maxBrightness, targetBrightness));
    }

    targetBrightness = Math.round(targetBrightness) / 100;

    if (selectDimmableDevice.type === 'zone') {
      const devices = await homeyAPI.devices.getDevices();
      const zoneDevices = Object.values(devices).filter(device =>
        device.zone === selectDimmableDevice.id && 
        device.capabilities.includes('dim') && 
        device.class === 'light'
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
