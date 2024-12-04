async function register(homey, homeyAPI, { generateUniqueId, SetInMemoryDimmy, GetInMemoryDimmy, sleep, autocompleteDevices }) {
  const card_Then_ChangeBrightnessAndTemperatureOverDuration = homey.flow.getActionCard('card_Then_ChangeBrightnessAndTemperatureOverDuration');

  card_Then_ChangeBrightnessAndTemperatureOverDuration
    .registerArgumentAutocompleteListener(
      'selectDimmableDevice',
      autocompleteDevices.bind(null, homeyAPI)
    )
    .registerRunListener(onFlowChangeBrightnessAndTemperatureOverDuration.bind(null, homeyAPI, { generateUniqueId, SetInMemoryDimmy, GetInMemoryDimmy, sleep }));
}

async function dimDevicesAndTemperatureInSync(homeyAPI, helpers, devices, targetBrightness, targetTemperature, setDuration) {
  const { generateUniqueId, SetInMemoryDimmy, GetInMemoryDimmy } = helpers;

  const stepDuration = 410;
  const totalDuration = setDuration * 1000;
  const steps = Math.max(Math.round(totalDuration / stepDuration), 1);
  const actualStepDuration = totalDuration / steps;

  const devicesInfo = await Promise.all(devices.map(async (device) => {
    const currentDevice = await homeyAPI.devices.getDevice({ id: device.id });
    const deviceid = currentDevice.id;

    let currentOnOffState = currentDevice.capabilitiesObj.onoff.value;
    let currentBrightness = currentDevice.capabilitiesObj.dim.value || 0;
    let currentTemperature = currentDevice.capabilitiesObj.light_temperature?.value || 0;

    if (!currentOnOffState) currentBrightness = 0;

    const currentToken = generateUniqueId();
    SetInMemoryDimmy(deviceid, currentToken);

    if (currentBrightness === targetBrightness && 
        currentTemperature === targetTemperature && 
        currentOnOffState === (targetBrightness > 0)) {
      return { skip: true };
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
  const stepTemperatureMap = devicesToUpdate.map(({ currentTemperature }) => 
    (targetTemperature - currentTemperature) / steps);

  const startTime = Date.now();

  for (let currentStep = 0; currentStep < steps; currentStep++) {
    const stepStartTime = Date.now();
    const allOperations = [];

    devicesToUpdate.forEach((info, index) => {
      const { currentDevice, currentToken, deviceid } = info;

      if (GetInMemoryDimmy(deviceid) !== currentToken) return;

      let newBrightness = info.currentBrightness + stepBrightnessMap[index] * (currentStep + 1);
      let newTemperature = info.currentTemperature + stepTemperatureMap[index] * (currentStep + 1);
      newBrightness = parseFloat(newBrightness.toFixed(2));
      newTemperature = parseFloat(newTemperature.toFixed(2));

      if (targetBrightness === 0) {
        newBrightness = Math.max(0.01, newBrightness);
      }

      allOperations.push(
        currentDevice.setCapabilityValue('dim', newBrightness),
        currentDevice.setCapabilityValue('light_temperature', newTemperature)
      );
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
  if (targetBrightness === 0) {
    for (const { currentDevice, currentToken, deviceid } of devicesToUpdate) {
      if (GetInMemoryDimmy(deviceid) === currentToken) {
        try {
          // Eerst laatste temperature instelling
          await currentDevice.setCapabilityValue('light_temperature', targetTemperature);
          // Wacht kort
          await new Promise(resolve => setTimeout(resolve, 50));
          // Dan dim naar 0
          await currentDevice.setCapabilityValue('dim', 0);
          // Wacht weer kort
          await new Promise(resolve => setTimeout(resolve, 50));
          // Dan uitschakelen
          await currentDevice.setCapabilityValue('onoff', false);
          // Wacht voor volgende device
          await new Promise(resolve => setTimeout(resolve, 50));
        } catch (error) {
          console.log(`Error setting final state for device ${deviceid}:`, error);
        }
      }
    }
  } else {
    // Zet finale waarden voor niet-uitschakel scenario
    await Promise.all(devicesToUpdate.map(async ({ currentDevice, currentToken, deviceid }) => {
      if (GetInMemoryDimmy(deviceid) === currentToken) {
        try {
          await currentDevice.setCapabilityValue('dim', targetBrightness);
          await currentDevice.setCapabilityValue('light_temperature', targetTemperature);
        } catch (error) {
          console.log(`Error setting final values for device ${deviceid}:`, error);
        }
      }
    }));
  }
}

async function onFlowChangeBrightnessAndTemperatureOverDuration(homeyAPI, helpers, args) {
  const { generateUniqueId, SetInMemoryDimmy, GetInMemoryDimmy, sleep } = helpers;
  try {
    const { selectDimmableDevice, setDuration, setBrightness, setTemperature } = args;

    let targetBrightness = setBrightness / 100;
    let targetTemperature = setTemperature / 100;

    if (selectDimmableDevice.type === 'zone') {
      const devices = await homeyAPI.devices.getDevices();
      const zoneDevices = Object.values(devices).filter(device =>
        device.zone === selectDimmableDevice.id && 
        device.capabilities.includes('dim') && 
        device.capabilities.includes('light_temperature') && 
        device.class === 'light'
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
