async function register(homey, homeyAPI, helpers) {
  const card = homey.flow.getActionCard('card_Then_CancelTransition');

  card
    .registerArgumentAutocompleteListener(
      'selectDimmableDevice',
      async query => helpers.autocompleteDevices(homeyAPI, query)
    )
    .registerRunListener(async args => {
      try {
        const { selectDimmableDevice } = args;

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

          zoneDevices.forEach(device => {
            helpers.SetInMemoryDimmy(device.id, helpers.generateUniqueId());
          });
        } else {
          helpers.SetInMemoryDimmy(selectDimmableDevice.id, helpers.generateUniqueId());
        }

        return true;
      } catch (error) {
        console.error('Cancel transition error:', error);
        return false;
      }
    });
}

module.exports = { register };
