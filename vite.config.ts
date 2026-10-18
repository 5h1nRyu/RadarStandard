import { defineConfig } from 'vite';

// Relative assets also work under /RadarStandard/ and custom Pages domains.
export default defineConfig({ base: './', build: { target: 'es2022' } });
