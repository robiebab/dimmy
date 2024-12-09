async function register(homey, homeyAPI, helpers) {
  const card = homey.flow.getActionCard('card_Then_ChangeBrightnessAndTemperatureOverDurationAndLux_Reverse');

  card
    .registerArgumentAutocompleteListener(
      'selectDimmableDevice',
      async query => helpers.autocompleteDevices(homeyAPI, query)
    )
    .registerRunListener(async args => {
      try {
        const { 
          selectDimmableDevice, 
          setDuration, 
          luxValue, 
          luxThreshold, 
          minBrightness, 
          maxBrightness, 
          setTemperature 
        } = args;

        const targetTemperature = setTemperature / 100;
        const targetBrightness = helpers.calculateTargetBrightness(
          1,              // isReversed (1 voor reverse mode)
          luxValue,       // huidige lux waarde
          luxThreshold,   // maximum lux waarde
          minBrightness, // minimum brightness
          maxBrightness  // maximum brightness
        );

        if (selectDimmableDevice.type === 'zone') {
          const devices = await homeyAPI.devices.getDevices();
          const zoneDevices = Object.values(devices).filter(device => 
            device.zone === selectDimmableDevice.id && 
            device.capabilities.includes('dim') && 
            device.capabilities.includes('light_temperature') && 
            device.class === 'light'
          );

          if (!zoneDevices.length) {
            throw new Error(`No dimmable devices found in zone: ${selectDimmableDevice.name}`);
          }

          await helpers.dimDevicesAndTemperatureInSync(
            homeyAPI, 
            helpers, 
            zoneDevices, 
            targetBrightness, 
            targetTemperature, 
            setDuration
          );
        } else {
          await helpers.dimDevicesAndTemperatureInSync(
            homeyAPI, 
            helpers, 
            [selectDimmableDevice], 
            targetBrightness, 
            targetTemperature, 
            setDuration
          );
        }

        return true;
      } catch (error) {
        console.error('Flow action error:', error);
        return false;
      }
    });
}

module.exports = { register };
