#!/usr/bin/env node

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios');
const fs = require('fs');
const readline = require('readline');
const path = require('path');
const { execSync } = require('child_process');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const randomUseragent = require('random-useragent');
const proxyChain = require('proxy-chain');

// Use stealth plugin to avoid detection
puppeteer.use(StealthPlugin());

let currentVideoId = null;
let profileHandle = null;

/**
 * Prompts the user for input via the command line.
 * @param {string} question - The question to ask the user.
 * @returns {Promise<string>} - The user's input.
 */
function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Prompts for and validates the YouTube profile handle (e.g., @somechannel)
 * @returns {Promise<string>} - The YouTube profile handle (e.g., @CyberGirlYT)
 */
async function getYouTubeProfileHandle() {
  const profileHandle = await askQuestion("Enter the YouTube profile handle to start (e.g., @someyoutubechannel): ");
  if (!profileHandle.startsWith('@')) {
    console.log("Invalid profile handle format. It should start with '@'. Exiting.");
    process.exit(1);
  }
  return profileHandle;
}

/**
 * Function to launch Puppeteer with enhanced stealth and proxy rotation
 * @returns {Promise<Browser>} - The Puppeteer browser instance
 */
async function launchStealthBrowser() {
  // Run in headless mode and try to auto-accept cookies
  const browser = await puppeteer.launch({
    headless: true, // Do not show browser window
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      `--user-agent=${randomUseragent.getRandom()}`
    ],
    defaultViewport: {
      width: Math.floor(Math.random() * (1920 - 1024) + 1024),
      height: Math.floor(Math.random() * (1080 - 768) + 768)
    }
  });
  return browser;
}

// Function to add randomized headers to requests
async function addRequestInterception(page) {
  await page.setRequestInterception(true);
  page.on('request', request => {
    const headers = {
      ...request.headers(),
      'User-Agent': randomUseragent.getRandom(), // Randomize User-Agent
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.google.com/' // Mimic a real referer
    };

    request.continue({ headers });
  });
}

// Function to simulate human-like mouse movements
async function moveMouseHumanLike(page, startX, startY, endX, endY) {
  const steps = Math.floor(Math.random() * 10) + 5; // Randomize steps between 5 and 15
  const deltaX = (endX - startX) / steps;
  const deltaY = (endY - startY) / steps;

  for (let i = 0; i <= steps; i++) {
    const x = startX + deltaX * i;
    const y = startY + deltaY * i;
    await page.mouse.move(x, y);
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50));
  }
}

/**
 * Retrieves a list of unique YouTube video IDs from a channel’s Videos page.
 * @param {string} channelUrl - The base URL of the channel (e.g., https://www.youtube.com/c/ChannelName)
 * @returns {Promise<string[]>} - Array of video IDs
 */
async function getChannelVideos(channelUrl) {
  const browser = await launchStealthBrowser();
  const page = await browser.newPage();
  await addRequestInterception(page);
  page.setDefaultNavigationTimeout(90000);
  const videosPage = channelUrl + '/videos';
  console.log(`Navigating to ${videosPage}`);
  try {
    await page.goto(videosPage, { waitUntil: 'networkidle2' });
    await autoAcceptCookies(page);
    // Save screenshot and HTML for debugging
    await page.screenshot({ path: 'debug_youtube_videos_page.png', fullPage: true });
    const html = await page.content();
    fs.writeFileSync('debug_youtube_videos_page.html', html, 'utf8');
    let videoIds = [];
    let attempts = 0;
    while (videoIds.length === 0 && attempts < 3) {
      // Try all known selectors for video links and containers
      await Promise.race([
        page.waitForSelector('ytd-grid-video-renderer', {timeout: 15000}).catch(() => {}),
        page.waitForSelector('ytd-rich-grid-media', {timeout: 15000}).catch(() => {}),
        page.waitForSelector('ytd-item-section-renderer', {timeout: 15000}).catch(() => {}),
        page.waitForSelector('#contents', {timeout: 15000}).catch(() => {})
      ]);
      for (let i = 0; i < 20; i++) {
        await page.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
      videoIds = await page.evaluate(() => {
        const anchors = [
          ...Array.from(document.querySelectorAll('ytd-grid-video-renderer a#video-title')),
          ...Array.from(document.querySelectorAll('ytd-rich-grid-media a#video-title-link')),
          ...Array.from(document.querySelectorAll('ytd-rich-item-renderer a#video-title-link')),
          ...Array.from(document.querySelectorAll('ytd-item-section-renderer a#video-title')),
          ...Array.from(document.querySelectorAll('a[href*="/watch?v="]'))
        ];
        const ids = anchors.map(a => {
          const url = a.href || '';
          const match = url.match(/v=([\w-]{11})/);
          return match ? match[1] : null;
        });
        return Array.from(new Set(ids.filter(Boolean)));
      });
      attempts++;
    }
    if (videoIds.length === 0) {
      console.log('No video IDs found after retries. Attempting fallback with double_bubble.py...');
      try {
        // Use venv python for double_bubble.py
        const fallbackCmd = `/Users/mbaosint/Desktop/Projects/RippinTubes/rippintubesENV/bin/python3 double_bubble.py channel_videos_html`;
        fs.writeFileSync('channel_videos_html', html, 'utf8');
        const fallbackResult = execSync(fallbackCmd, { encoding: 'utf-8' });
        const parsed = JSON.parse(fallbackResult);
        if (parsed.video_ids && Array.isArray(parsed.video_ids) && parsed.video_ids.length > 0) {
          console.log(`double_bubble.py fallback found ${parsed.video_ids.length} videos.`);
          return parsed.video_ids;
        }
      } catch (e) {
        console.warn('double_bubble.py fallback did not find any videos or failed.');
      }
    }
    await browser.close();
    return videoIds;
  } catch (error) {
    console.error(`Error navigating to ${videosPage}:`, error.message);
    await browser.close();
    return [];
  }
}

/**
 * Extracts the transcript from the YouTube video page by interacting with the UI.
 * Finds and clicks the "more" button in the profile description, then "show transcript," and extracts the transcript.
 * @param {string} videoId - The video ID
 * @param {object} page - Puppeteer page instance
 * @returns {Promise<string|null>} - The extracted transcript text if found; otherwise, null.
 */
async function extractTranscriptFromUI(videoId, page) {
  try {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`Navigating to video page: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await autoAcceptCookies(page);
    try {
      const menuButtonSelector = 'button[aria-label*="More actions"], ytd-menu-renderer yt-icon-button';
      await page.waitForSelector(menuButtonSelector, { timeout: 7000 });
      await page.click(menuButtonSelector);
      await new Promise(resolve => setTimeout(resolve, 1000));
      const transcriptMenuSelector = 'ytd-menu-service-item-renderer[aria-label*="Transcript"], tp-yt-paper-item[role="menuitem"]';
      await page.waitForSelector(transcriptMenuSelector, { timeout: 7000 });
      const items = await page.$$(transcriptMenuSelector);
      for (const item of items) {
        const text = await page.evaluate(el => el.innerText, item);
        if (text && text.toLowerCase().includes('transcript')) {
          await item.click();
          break;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 1500));
    } catch (e) {
      const moreButtonSelector = 'tp-yt-paper-button#more';
      try {
        await page.waitForSelector(moreButtonSelector, { timeout: 5000 });
        await page.click(moreButtonSelector);
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {}
      const showTranscriptSelector = 'tp-yt-paper-button[aria-label*="Show transcript"]';
      try {
        await page.waitForSelector(showTranscriptSelector, { timeout: 5000 });
        await page.click(showTranscriptSelector);
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {}
    }
    const transcriptSelector = 'ytd-transcript-renderer, ytd-transcript-panel-renderer';
    try {
      await page.waitForSelector(transcriptSelector, { timeout: 7000 });
      const transcriptText = await page.evaluate((selector) => {
        const transcriptElement = document.querySelector(selector);
        return transcriptElement ? transcriptElement.innerText : null;
      }, transcriptSelector);
      if (transcriptText) {
        console.log("Transcript successfully extracted.");
        return transcriptText;
      } else {
        console.log("Transcript not found in the UI.");
        return null;
      }
    } catch (error) {
      console.warn("Transcript element not found or not loaded.", error.message);
      return null;
    }
  } catch (error) {
    console.error(`Error extracting transcript for video ${videoId}:`, error.message);
    return null;
  }
}

/**
 * Fetches the transcript for a given video ID using the youtube-transcript-api.
 * @param {string} videoId - The video ID
 * @returns {Promise<string|null>} - The transcript text if found; otherwise, null.
 */
async function getVideoTranscript(videoId) {
  try {
    console.log(`Fetching transcript for video ID: ${videoId}`);
    // Try youtube-transcript-api first
    const command = `python3 -c "from youtube_transcript_api import YouTubeTranscriptApi; print(YouTubeTranscriptApi.get_transcript('${videoId}'))"`;
    const result = execSync(command, { encoding: 'utf-8' });
    if (result) {
      console.log("Transcript successfully fetched (youtube-transcript-api).");
      return result;
    }
  } catch (error) {
    // If blocked, try double_bubble.py (was scrapling_youtube_transcript.py)
    console.warn("youtube-transcript-api blocked or failed, trying double_bubble.py (Scrapling)...");
    try {
      const scraplingCmd = `python3 double_bubble.py ${videoId}`;
      const scraplingResult = execSync(scraplingCmd, { encoding: 'utf-8' });
      const parsed = JSON.parse(scraplingResult);
      if (parsed.transcript && parsed.transcript.trim().length > 0) {
        console.log("Transcript successfully fetched (Scrapling/double_bubble.py).");
        return parsed.transcript;
      }
    } catch (scraplingError) {
      console.error("double_bubble.py (Scrapling) also failed:", scraplingError.message);
    }
  }
  return null;
}

/**
 * Loads the YouTube video page and extracts related video IDs from the recommendations.
 * @param {string} videoId - The video ID
 * @returns {Promise<string[]>} - Array of related video IDs
 */
async function getRelatedVideoIds(videoId) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const browser = await launchStealthBrowser();
  const page = await browser.newPage();
  
  // Navigate to the video page
  await page.goto(url, { waitUntil: 'networkidle2' });
  // Allow time for the recommendations to load
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Scrape all links that look like video links (avoid duplicates)
  const relatedVideoIds = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('a[href*="/watch?v="]'));
    const ids = anchors.map(anchor => {
      const match = anchor.href.match(/v=([^&]+)/);
      return match ? match[1] : null;
    });
    return Array.from(new Set(ids.filter(id => id)));
  });
  
  await browser.close();
  return relatedVideoIds;
}

/**
 * Ensures the TRANSCRIPTIONS directory exists and constructs the file path for saving transcripts.
 * @param {string} channelName - The name of the YouTube channel.
 * @param {string} videoName - The name of the video.
 * @returns {string} - The full file path for the transcript.
 */
function getTranscriptFilePath(channelName, videoName) {
  const sanitizedChannelName = channelName.replace(/[^a-zA-Z0-9]/g, '_');
  const sanitizedVideoName = videoName.replace(/[^a-zA-Z0-9]/g, '_');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dirPath = path.join(__dirname, 'TRANSCRIPTIONS');

  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath);
  }

  return path.join(dirPath, `${sanitizedChannelName}_${sanitizedVideoName}_${timestamp}.txt`);
}

/**
 * Checks if a transcript file already exists for a given video.
 * @param {string} channelName - The name of the YouTube channel.
 * @param {string} videoName - The name of the video.
 * @returns {boolean} - True if the transcript file exists, false otherwise.
 */
function doesTranscriptExist(channelName, videoName) {
  const sanitizedChannelName = channelName.replace(/[^a-zA-Z0-9]/g, '_');
  const sanitizedVideoName = videoName.replace(/[^a-zA-Z0-9]/g, '_');
  const dirPath = path.join(__dirname, 'TRANSCRIPTIONS');
  const filePattern = `${sanitizedChannelName}_${sanitizedVideoName}_*.txt`;
  const files = fs.readdirSync(dirPath);

  return files.some(file => file.startsWith(`${sanitizedChannelName}_${sanitizedVideoName}_`));
}

/**
 * Retrieves the channel ID for a given YouTube channel name using the YouTube API.
 * @param {string} channelName - The name of the YouTube channel.
 * @returns {Promise<string>} - The channel ID.
 */
async function getChannelId(channelName) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const searchQuery = channelName.replace(/\s+/g, '+');
  const url = `https://www.googleapis.com/youtube/v3/search?q=${searchQuery}&key=${apiKey}&part=snippet`;

  try {
    const response = await axios.get(url);
    const data = response.data;
    return data.items[0].snippet.channelId;
  } catch (error) {
    console.error("Error fetching channel ID:", error.message);
    throw error;
  }
}

/**
 * Retrieves video information (IDs, titles, and publish dates) from a YouTube playlist.
 * @param {string} playlistId - The ID of the YouTube playlist.
 * @returns {Promise<Array>} - An array of video information objects.
 */
async function getVideoInfo(playlistId) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const baseUrl = `https://www.googleapis.com/youtube/v3/playlistItems?playlistId=${playlistId}&key=${apiKey}&part=snippet&maxResults=50`;
  let videos = [];
  let nextPageToken = null;

  try {
    do {
      const url = nextPageToken ? `${baseUrl}&pageToken=${nextPageToken}` : baseUrl;
      const response = await axios.get(url);
      const data = response.data;

      videos = videos.concat(
        data.items.map(item => ({
          id: item.snippet.resourceId.videoId,
          title: item.snippet.title,
          publish_date: item.snippet.publishedAt.slice(0, 10),
        }))
      );

      nextPageToken = data.nextPageToken;
    } while (nextPageToken);

    return videos;
  } catch (error) {
    console.error("Error fetching video information:", error.message);
    throw error;
  }
}

/**
 * Main crawling function.
 *
 * Starts with a YouTube profile handle and processes videos (fetching transcripts)
 * using youtube-transcript-api.
 */
async function main() {
  console.log("YouTube Transcript Crawler");
  let videoIds = [];
  try {
    // Query the user for the YouTube profile handle
    profileHandle = await getYouTubeProfileHandle();
    // Construct the YouTube profile URL
    const baseUrl = 'https://www.youtube.com';
    const profileUrl = `${baseUrl}/${profileHandle}`;
    console.log(`DEBUG: profileUrl = ${profileUrl}`);
    console.log(`Starting crawl for profile: ${profileHandle}`);

    // Get initial video IDs from the profile's Videos page using Puppeteer scraping
    videoIds = await getChannelVideos(profileUrl);
    console.log(`Found ${videoIds.length} videos for the profile.`);

    // Use a set to avoid reprocessing the same videos
    const crawled = new Set();
    const queue = [...videoIds];
    const maxVideos = 100;
    let count = 0;

    while (queue.length > 0 && count < maxVideos) {
      const videoId = queue.shift();
      if (crawled.has(videoId)) continue;
      crawled.add(videoId);
      currentVideoId = videoId;
      console.log(`\nProcessing video: https://www.youtube.com/watch?v=${videoId}`);
      await fetchAndFormatTranscript(videoId, profileHandle, ['en', 'de'], null);
      count++;
      const delayTime = Math.random() * (73000 - 11000) + 11000;
      console.log(`Waiting for ${Math.round(delayTime / 1000)} seconds before processing the next video...`);
      await delay(delayTime);
    }
    console.log(`\nCrawling finished. Processed ${count} videos.`);
  } catch (error) {
    console.error("An unexpected error occurred:", error.message);
    console.error(error.stack);
  } finally {
    // Always run cleaned_and_repacked.py at the end
    try {
      console.log("\nRunning cleaned_and_repacked.py to process all transcripts...");
      const cleanedCmd = `/Users/mbaosint/Desktop/Projects/RippinTubes/rippintubesENV/bin/python3 cleaned_and_repacked.py`;
      const { execSync } = require('child_process');
      execSync(cleanedCmd, { stdio: 'inherit' });
    } catch (e) {
      console.error("Error running cleaned_and_repacked.py:", e.message);
    }
  }
}

/**
 * Fetches related channels for a given YouTube profile handle.
 * @param {string} profileHandle - The YouTube profile handle.
 * @returns {Promise<string[]>} - An array of related channel handles.
 */
async function getRelatedChannels(profileHandle) {
  const browser = await launchStealthBrowser();
  const page = await browser.newPage();

  try {
    const url = `https://www.youtube.com/${profileHandle}/channels`;
    console.log(`Navigating to related channels page: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Extract related channel handles
    const relatedChannels = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href^="/@"]'));
      return anchors.map(anchor => anchor.getAttribute('href').replace('/', ''));
    });

    return Array.from(new Set(relatedChannels)); // Remove duplicates
  } catch (error) {
    console.error("Error fetching related channels:", error.message);
    return [];
  } finally {
    await browser.close();
  }
}

/**
 * Consolidates all transcript files into a single JSONL file.
 * @param {string} transcriptsDir - The directory containing transcript files.
 * @param {string} outputFilePath - The path to save the consolidated JSONL file.
 */
function consolidateTranscripts(transcriptsDir, outputFilePath) {
  const files = fs.readdirSync(transcriptsDir);
  const consolidated = [];

  files.forEach(file => {
    const filePath = path.join(transcriptsDir, file);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      consolidated.push(content); // Save the raw content without parsing
    } catch (error) {
      console.error(`Error reading file ${file}: ${error.message}`);
    }
  });

  fs.writeFileSync(outputFilePath, consolidated.join('\n'), 'utf8');
  console.log(`Consolidated transcripts saved to ${outputFilePath}`);
}

process.on('SIGINT', async () => {
  console.log('\nTermination signal received. Completing the current download before exiting...');

  try {
    if (currentVideoId) {
      console.log(`Finishing transcript download for video ID: ${currentVideoId}`);
      const transcript = await getVideoTranscript(currentVideoId);

      if (transcript) {
        const filePath = getTranscriptFilePath(profileHandle, `Video_${currentVideoId}`);
        console.log(`-> Transcript found for ${currentVideoId} [saving to ${filePath}]`);
        fs.writeFileSync(filePath, transcript, 'utf8');
      } else {
        console.log(`-> No transcript available for ${currentVideoId}.`);
      }
    }

    // Consolidate transcripts before exiting
    const transcriptsDir = path.join(__dirname, 'TRANSCRIPTIONS');
    const outputFilePath = path.join(__dirname, 'consolidated_transcripts.jsonl');
    consolidateTranscripts(transcriptsDir, outputFilePath);

    console.log('Exiting program.');
  } catch (error) {
    console.error("Error during shutdown:", error.message);
  } finally {
    process.exit(0);
  }
});

// Function to format transcript into JSON
function formatTranscriptToJson(transcript) {
  return JSON.stringify(transcript, null, 2); // Pretty-print JSON with 2 spaces
}

// Function to fetch and format transcript into JSON
async function fetchAndFormatTranscript(videoId, channelName, languages = ['en'], cookiePath = null) {
  try {
    let transcript = await getVideoTranscript(videoId);
    if (!transcript) {
      // Fallback to UI scraping
      const browser = await launchStealthBrowser();
      const page = await browser.newPage();
      await addRequestInterception(page);
      transcript = await extractTranscriptFromUI(videoId, page);
      await browser.close();
    }
    if (!transcript) {
      console.log(`No transcript found for video ${videoId}`);
      return null;
    }
    const filePath = getTranscriptFilePath(channelName, videoId);
    fs.writeFileSync(filePath, transcript, 'utf8');
    console.log(`Transcript saved to: ${filePath}`);
    return transcript;
  } catch (error) {
    console.error(`Error fetching or saving transcript for video ${videoId}:`, error.message);
    return null;
  }
}

// In getChannelVideos and extractTranscriptFromUI, auto-accept cookies if present
async function autoAcceptCookies(page) {
  // Try common cookie accept button selectors
  const selectors = [
    'button[aria-label*="Accept all"]',
    'button[aria-label*="Accept cookies"]',
    'button[aria-label*="Alle akzeptieren"]',
    'button[aria-label*="Tout accepter"]',
    'button[aria-label*="Zustimmen"]',
    'button[aria-label*="Ich stimme zu"]',
    'button[aria-label*="Accept the use of cookies and other data for the purposes described"]',
    'form[action*="consent"] button',
    '#introAgreeButton',
    '.ytp-cookies-accept',
    'button:contains(Alle akzeptieren)',
    'button:contains(Accept all)'
  ];
  for (const selector of selectors) {
    try {
      const btn = await page.$(selector);
      if (btn) {
        await btn.click();
        await page.waitForTimeout(500);
        break;
      }
    } catch (e) {}
  }
}

main();
