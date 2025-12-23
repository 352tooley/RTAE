// Simple pairing script for Windows
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

console.log('RTAE Agent Pairing Tool');
console.log('=======================\n');

// Prompt for inputs
process.stdout.write('Enter Firebase Project ID [rtae-6211e]: ');
let projectId = '';
let region = '';
let code = '';

readline.on('line', async (input) => {
  if (!projectId) {
    projectId = input.trim() || 'rtae-6211e';
    process.stdout.write('Enter Firebase Region [us-central1]: ');
  } else if (!region) {
    region = input.trim() || 'us-central1';
    process.stdout.write('Enter 6-digit pairing code: ');
  } else if (!code) {
    code = input.trim();
    readline.close();

    console.log('\nClaiming pairing code...');

    try {
      const response = await axios.post(
        `https://${region}-${projectId}.cloudfunctions.net/claimPairingCode`,
        { data: { code } }
      );

      const { deviceId, deviceToken } = response.data.result;

      const config = {
        deviceId,
        deviceToken,
        firebaseProjectId: projectId,
        firebaseRegion: region,
      };

      fs.writeFileSync('agent-config.json', JSON.stringify(config, null, 2));

      console.log('\n✓ Device paired successfully!');
      console.log(`Device ID: ${deviceId}`);
      console.log('Configuration saved to agent-config.json\n');
      console.log('Now run: npm start');

      process.exit(0);
    } catch (error) {
      console.error('\n✗ Pairing failed:', error.response?.data || error.message);
      process.exit(1);
    }
  }
});
