async function register(homey, homeyAPI, helpers) {
  const card = homey.flow.getActionCard('card_Then_ChangeBrightnessOverDuration');

  card
    .registerArgumentAutocompleteListener(
      'selectDimmableDevice',
      async query => helpers.autocompleteDevices(homeyAPI, query)
    )
    .registerRunListener(async args => {
      try {
        const { selectDimmableDevice, setBrightness, setDuration } = args;
        const targetBrightness = setBrightness / 100;

        if (selectDimmableDevice.type === 'zone') {
          const devices = await homeyAPI.devices.getDevices();
          const zoneDevices = Object.values(devices).filter(device => 
            device.zone === selectDimmableDevice.id && 
            device.capabilities.includes('dim') && 
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
            null, 
            setDuration
          );
        } else {
          await helpers.dimDevicesAndTemperatureInSync(
            homeyAPI, 
            helpers, 
            [selectDimmableDevice], 
            targetBrightness, 
            null, 
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
