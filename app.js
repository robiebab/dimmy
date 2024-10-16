const { HomeyAPI } = require('homey-api');
const Homey = require('homey');

// Memory management and helper functions
const memoryValuesDimmy = {};
let uniqueIdCounter = 0;  // In-memory counter to avoid duplicate simultaneous actions

// Generate a unique ID for each action
function generateUniqueId() {
  uniqueIdCounter += 1;  // Increment the counter
  return uniqueIdCounter;  // Return the unique ID
}

// Store a value in memory with a key
function SetInMemoryDimmy(key, value) {
  memoryValuesDimmy[key] = value;
}

// Retrieve a value from memory using a key
function GetInMemoryDimmy(key) {
  return memoryValuesDimmy[key];
}

// Helper function to sleep for a given duration in milliseconds
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Moved the autocompleteDevices function to app.js to handle device search
async function autocompleteDevices(homeyAPI, query) {
  // Set a timeout promise function
  const timeout = (ms) => new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Request timed out')), ms)
  );

  try {
    // Fetch devices and zones or timeout after 30 seconds (30000ms)
    const [devices, zones] = await Promise.race([
      Promise.all([homeyAPI.devices.getDevices(), homeyAPI.zones.getZones()]),
      timeout(30000)  // Timeout set to 30 seconds
    ]);

    // Filter and map the devices that support dimming and are of class 'light'
    const filteredDevices = Object.values(devices)
      .filter(device => device.capabilities.includes('dim') && device.class === 'light')
      .map(device => ({
        name: device.name,
        id: device.id,
        zone: device.zone,  // Include the zone ID to help with sorting within zones
        type: 'device'  // Adding type to differentiate devices from zones
      }));

    // Filter zones with dimmable devices
    const filteredZones = Object.values(zones)
      .map(zone => {
        const zoneDevices = filteredDevices.filter(device => device.zone === zone.id);
        if (zoneDevices.length > 0) {
          // Sort devices within the zone by name
          const sortedZoneDevices = zoneDevices.sort((a, b) => a.name.localeCompare(b.name));
          return {
            name: zone.name + ' (Zone)',
            id: zone.id,
            devices: sortedZoneDevices,
            type: 'zone'  // Adding type to differentiate zones from devices
          };
        }
        return null;
      })
      .filter(zone => zone && zone.name.toLowerCase().includes(query.toLowerCase()))  // Filter based on the search query
      .sort((a, b) => a.name.localeCompare(b.name));  // Sort zones by name

    // Combine filtered zones and devices into one list, showing devices under their respective zone
    let result = [];
    filteredZones.forEach(zone => {
      result.push({ name: zone.name, id: zone.id, type: 'zone' });  // Add zone to the list
      zone.devices.forEach(device => {
        result.push({ name: ' - ' + device.name, id: device.id, type: 'device' });  // Indent device names under the zone
      });
    });

    return result;
  } catch (error) {
    console.log('Error fetching devices or zones:', error);
    return [];
  }
}

class App extends Homey.App {
  async onInit() {
    // Log that the app has been initialized
    this.log('App has been initialized');      

    // Create and cache an instance of the Homey API for later use
    this.homeyAPI = await HomeyAPI.createAppAPI({ homey: this.homey });

    // Load and register the flow cards
    this.registerFlowCards();
  }

  registerFlowCards() {
    const options = { generateUniqueId, SetInMemoryDimmy, GetInMemoryDimmy, sleep, autocompleteDevices};
    // Register the card for changing brightness over duration
    require('./cards/card_Then_ChangeBrightnessOverDuration').register(this.homey, this.homeyAPI, options);
    // Register the card for changing brightness and temperature over duration
    require('./cards/card_Then_ChangeBrightnessAndTemperatureOverDuration').register(this.homey, this.homeyAPI, options);
    // Register the card for changing brightness over duration and LUX
    require('./cards/card_Then_ChangeBrightnessOverDurationAndLux').register(this.homey, this.homeyAPI, options);    
    // Register the card for blinking lights
    require('./cards/card_Then_BlinkLight').register(this.homey, this.homeyAPI, options);    
    // Register the card for changing brightness and temperature over duration and LUX
    require('./cards/card_Then_ChangeBrightnessAndTemperatureOverDurationAndLux').register(this.homey, this.homeyAPI, options); 
    // Register the card for changing brightness over duration and LUX reverse
    require('./cards/card_Then_ChangeBrightnessOverDurationAndLux_Reverse').register(this.homey, this.homeyAPI, options);   
    // Register the card for changing brightness over duration and LUX reverse
    require('./cards/card_Then_ChangeBrightnessAndTemperatureOverDurationAndLux_Reverse').register(this.homey, this.homeyAPI, options);      
  }
}

module.exports = App;