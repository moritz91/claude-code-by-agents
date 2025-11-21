#!/usr/bin/env node
/**
 * Clean build directory
 * Replaces rimraf dependency with native Node.js fs
 */

import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath = join(__dirname, '../dist');

try {
  console.log('🧹 Cleaning dist directory...');
  rmSync(distPath, { recursive: true, force: true });
  console.log('✅ Cleaned dist directory');
} catch (error) {
  // Ignore if directory doesn't exist
  if (error.code !== 'ENOENT') {
    console.error('Failed to clean dist directory:', error);
    process.exit(1);
  }
}
