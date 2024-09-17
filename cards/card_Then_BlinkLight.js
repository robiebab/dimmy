async function register(homey, homeyAPI, { generateUniqueId, SetInMemoryDimmy, GetInMemoryDimmy, sleep, autocompleteDevices }) {
  // Register the flow action card and attach autocomplete and run listeners
  const card_Then_BlinkLight = homey.flow.getActionCard('card_Then_BlinkLight');

  card_Then_BlinkLight
    .registerArgumentAutocompleteListener(
      'selectDimmableDevice',
      autocompleteDevices.bind(null, homeyAPI)
    )
    .registerRunListener(onFlowBlinkLight.bind(null, homeyAPI, { generateUniqueId, SetInMemoryDimmy, GetInMemoryDimmy, sleep }));
}

async function onFlowBlinkLight(homeyAPI, helpers, args) {
  const { generateUniqueId, SetInMemoryDimmy, GetInMemoryDimmy, sleep } = helpers;
  try {
    const { selectDimmableDevice, setBlinkInterval, blinkCount } = args;

    const devices = [];

    // Check if the selected device is a zone
    if (selectDimmableDevice.type === 'zone') {
      // Retrieve all dimmable devices in the selected zone
      const allDevices = await homeyAPI.devices.getDevices();
      const zoneDevices = Object.values(allDevices).filter(device =>
        device.zone === selectDimmableDevice.id && device.capabilities.includes('dim') && device.class === 'light'
      );

      if (zoneDevices.length === 0) {
        throw new Error(`No dimmable devices found in the selected zone: ${selectDimmableDevice.name}`);
      }

      devices.push(...zoneDevices);
    } else {
      // Single device was selected
      const device = await homeyAPI.devices.getDevice({ id: selectDimmableDevice.id });
      devices.push(device);
    }

    // Generate a unique token for all devices to synchronize them
    const currentToken = generateUniqueId();

    // Function to dim in (from 0 to 100%) and out (from 100% to 0%) smoothly
    const dimLight = async (device, startBrightness, endBrightness, stepDuration) => {
      let currentBrightness = startBrightness;
      const brightnessStep = (endBrightness - startBrightness) / (stepDuration / 333);

      for (let step = 0; step < stepDuration / 333; step++) {
        if (GetInMemoryDimmy(device.id) != currentToken) {
          return;
        }
        currentBrightness += brightnessStep;
        await device.setCapabilityValue('dim', parseFloat(currentBrightness.toFixed(2)));
        await sleep(333);
      }

      await device.setCapabilityValue('dim', endBrightness);
    };

    // Function to blink all devices synchronously
    const blinkDevice = async (device) => {
      const originalBrightness = device.capabilitiesObj.dim.value || 0;

      // Store the original brightness in case we need to restore it later
      SetInMemoryDimmy(device.id, currentToken);

      // Main loop to handle blinking
      for (let i = 0; i < blinkCount; i++) {
        if (GetInMemoryDimmy(device.id) != currentToken) {
          return;
        }

        // Dim in (from 0 to 100%)
        await dimLight(device, 0, 1, setBlinkInterval * 1000);
        await sleep(setBlinkInterval * 1000);

        // Dim out (from 100% to 0%)
        await dimLight(device, 1, 0, setBlinkInterval * 1000);
        await sleep(setBlinkInterval * 1000);
      }

      // Restore original brightness
      if (GetInMemoryDimmy(device.id) == currentToken) {
        await device.setCapabilityValue('dim', originalBrightness);
      }
    };

    // Run the blink process for all devices in the zone or the selected device in parallel
    await Promise.all(devices.map(device => blinkDevice(device)));

    return true;
  } catch (error) {
    console.log('Error running flow action:', error);
    return false;
  }
}

module.exports = {
  register
};