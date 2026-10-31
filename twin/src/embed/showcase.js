// Shared by the twin (embedded mode) and its exterior module for the Amphicos 3D Platform.
// The Amphicos converter containers shown on deck as a product showcase, in ship coordinates. The host
// places its own detailed models at exactly these positions, so the deck looks the same on both sides.
// Open deck gap between the process modules (x 121 to 140): AMP-SPC centred on the starboard side (facing the rig),
// AMP-HI centred on the port side, each about 4 m clear of the modules and their platforms.
export const SHOWCASE = [
  { id: 'spc', label: 'AMP-SPC converter (showcase)', pos: [130.5, -13.5, 28], size: [10.6, 12.86, 6.0], color: '#4b5157', band: '#1d3f6e' },
  { id: 'hi', label: 'AMP-HI hybrid inverter (showcase)', pos: [130.5, 13.5, 28], size: [2.44, 12.19, 2.9], color: '#dfe2e4', band: '#1d3f6e' },
];
