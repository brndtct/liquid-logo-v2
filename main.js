import { parseLogoImage, LiquidLogo } from './liquid-logo.js';

const canvas = document.getElementById('logo-canvas');

async function start() {
  try {
    const response = await fetch('logo.svg');
    if (!response.ok) throw new Error('Failed to load logo.svg');

    const blob = await response.blob();
    const file = new File([blob], 'logo.svg', { type: blob.type });

    const result = await parseLogoImage(file);
    const imageData = result?.imageData;

    if (!imageData) {
      console.error('No image data returned');
      return;
    }

    const params = {
      edge: 2,
      patternBlur: 0.005,
      patternScale: 2,
      refraction: 0.015,
      speed: 0.3,
      liquid: 0.07
    };

    new LiquidLogo(canvas, imageData, params);

  } catch (err) {
    console.error('Error during setup:', err);
  }
}

start();
