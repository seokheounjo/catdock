/**
 * Generate 6 cute cat breed avatar images using AI Horde (stablehorde.net) SDXL models.
 * Saves as WebP to src/renderer/src/assets/cats/avatars/
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, 'src', 'renderer', 'src', 'assets', 'cats', 'avatars');

const API_KEY = '0000000000';
const BASE_URL = 'https://stablehorde.net/api/v2';

const POLL_INTERVAL = 5000; // 5 seconds
const TIMEOUT = 600000; // 600 seconds

// Models to try in order of preference
const MODELS_TO_TRY = [
  'AlbedoBase XL (SDXL)',
  'DreamShaper XL',
  'SDXL 1.0',
  'Juggernaut XL',
];

const BREEDS = [
  { name: 'Maine Coon', file: 'maine-coon.webp' },
  { name: 'Scottish Fold', file: 'scottish-fold.webp' },
  { name: 'Russian Blue', file: 'russian-blue.webp' },
  { name: 'Bengal', file: 'bengal.webp' },
  { name: 'Siamese', file: 'siamese.webp' },
  { name: 'British Shorthair', file: 'british-shorthair.webp' },
];

function makePrompt(breed) {
  return `cute kawaii chibi ${breed} cat, adorable round face, big sparkling eyes, soft pastel colors, digital art illustration, simple clean background, sticker style, high quality, detailed fur, adorable expression, anime style, flat color ### realistic, photo, ugly, deformed, blurry, low quality, horror, scary, text, watermark, signature`;
}

async function submitGeneration(breed, model) {
  const prompt = makePrompt(breed);
  const body = {
    prompt,
    params: {
      width: 1024,
      height: 1024,
      steps: 30,
      cfg_scale: 7,
      sampler_name: 'k_euler_a',
      n: 1,
      post_processing: ['RealESRGAN_x2plus'],
    },
    nsfw: false,
    models: [model],
    r2: true,
    shared: false,
    replacement_filter: true,
  };

  console.log(`[${breed}] Submitting generation with model: ${model}`);
  console.log(`[${breed}] Prompt: ${prompt.substring(0, 80)}...`);

  const res = await fetch(`${BASE_URL}/generate/async`, {
    method: 'POST',
    headers: {
      'apikey': API_KEY,
      'Content-Type': 'application/json',
      'Client-Agent': 'virtual-company:1.0:anonymous',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Submit failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  console.log(`[${breed}] Job submitted: ${data.id}`);
  return data.id;
}

async function pollUntilDone(breed, jobId) {
  const startTime = Date.now();

  while (Date.now() - startTime < TIMEOUT) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));

    const res = await fetch(`${BASE_URL}/generate/check/${jobId}`, {
      headers: { 'Client-Agent': 'virtual-company:1.0:anonymous' },
    });

    if (!res.ok) {
      console.warn(`[${breed}] Check failed (${res.status}), retrying...`);
      continue;
    }

    const status = await res.json();
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    if (status.faulted) {
      throw new Error(`[${breed}] Generation faulted!`);
    }

    if (status.done) {
      console.log(`[${breed}] Done! (${elapsed}s)`);
      return;
    }

    console.log(
      `[${breed}] Waiting... queue: ${status.queue_position}, wait: ${status.wait_time}s, elapsed: ${elapsed}s`
    );
  }

  throw new Error(`[${breed}] Timed out after ${TIMEOUT / 1000}s`);
}

async function getResult(breed, jobId) {
  const res = await fetch(`${BASE_URL}/generate/status/${jobId}`, {
    headers: { 'Client-Agent': 'virtual-company:1.0:anonymous' },
  });

  if (!res.ok) {
    throw new Error(`[${breed}] Status fetch failed (${res.status})`);
  }

  const data = await res.json();

  if (!data.generations || data.generations.length === 0) {
    throw new Error(`[${breed}] No generations in result`);
  }

  const gen = data.generations[0];
  console.log(`[${breed}] Image URL: ${gen.img}`);
  console.log(`[${breed}] Model used: ${gen.model}`);
  console.log(`[${breed}] Worker: ${gen.worker_name}`);

  return gen.img;
}

async function downloadImage(breed, url, outputPath) {
  console.log(`[${breed}] Downloading image...`);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`[${breed}] Download failed (${res.status})`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);

  const sizeKB = Math.round(buffer.length / 1024);
  console.log(`[${breed}] Saved to ${outputPath} (${sizeKB} KB)`);
}

async function generateOne(breed, fileName) {
  let lastError;

  for (const model of MODELS_TO_TRY) {
    try {
      const jobId = await submitGeneration(breed, model);
      await pollUntilDone(breed, jobId);
      const imageUrl = await getResult(breed, jobId);

      const outputPath = path.join(OUTPUT_DIR, fileName);
      await downloadImage(breed, imageUrl, outputPath);

      console.log(`[${breed}] SUCCESS!\n`);
      return;
    } catch (err) {
      console.error(`[${breed}] Error with model "${model}": ${err.message}`);
      lastError = err;
    }
  }

  throw new Error(`[${breed}] All models failed. Last error: ${lastError?.message}`);
}

async function main() {
  console.log('=== Cat Avatar Generator v2 (SDXL) ===\n');
  console.log(`Output directory: ${OUTPUT_DIR}`);
  console.log(`Models to try: ${MODELS_TO_TRY.join(', ')}`);
  console.log(`Breeds: ${BREEDS.map((b) => b.name).join(', ')}\n`);

  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Submit all jobs first (in parallel), then poll
  const jobs = [];

  for (const breed of BREEDS) {
    try {
      const jobId = await submitGeneration(breed.name, MODELS_TO_TRY[0]);
      jobs.push({ breed, jobId, model: MODELS_TO_TRY[0] });
      // Small delay between submissions to be nice to the API
      await new Promise((r) => setTimeout(r, 1000));
    } catch (err) {
      console.error(`[${breed.name}] Failed to submit with ${MODELS_TO_TRY[0]}: ${err.message}`);
      // Try fallback models
      let submitted = false;
      for (let i = 1; i < MODELS_TO_TRY.length; i++) {
        try {
          const jobId = await submitGeneration(breed.name, MODELS_TO_TRY[i]);
          jobs.push({ breed, jobId, model: MODELS_TO_TRY[i] });
          submitted = true;
          break;
        } catch (err2) {
          console.error(
            `[${breed.name}] Failed with ${MODELS_TO_TRY[i]}: ${err2.message}`
          );
        }
      }
      if (!submitted) {
        console.error(`[${breed.name}] SKIPPED - no model available`);
      }
    }
  }

  console.log(`\nSubmitted ${jobs.length} jobs. Now polling for results...\n`);

  // Poll all jobs in parallel
  const results = await Promise.allSettled(
    jobs.map(async ({ breed, jobId }) => {
      await pollUntilDone(breed.name, jobId);
      const imageUrl = await getResult(breed.name, jobId);
      const outputPath = path.join(OUTPUT_DIR, breed.file);
      await downloadImage(breed.name, imageUrl, outputPath);
      console.log(`[${breed.name}] SUCCESS!\n`);
    })
  );

  // Summary
  console.log('\n=== SUMMARY ===');
  let successCount = 0;
  let failCount = 0;
  results.forEach((result, i) => {
    const breed = jobs[i].breed.name;
    if (result.status === 'fulfilled') {
      console.log(`  [OK] ${breed}`);
      successCount++;
    } else {
      console.log(`  [FAIL] ${breed}: ${result.reason?.message}`);
      failCount++;
    }
  });
  console.log(`\nDone: ${successCount} success, ${failCount} failed`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
