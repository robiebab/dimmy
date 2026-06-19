async function register(homey, homeyAPI, helpers) {
  const card = homey.flow.getActionCard('card_Then_ChangeBrightnessAndTemperatureOverDuration');

  card
    .registerArgumentAutocompleteListener(
      'selectDimmableDevice',
      async query => helpers.autocompleteDevices(homeyAPI, query)
    )
    .registerRunListener(async args => {
      try {
        const { selectDimmableDevice, setDuration, setBrightness, setTemperature } = args;
        const targetBrightness = setBrightness / 100;
        const targetTemperature = setTemperature / 100;

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
