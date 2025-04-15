#!/usr/bin/env node

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios');
const fs = require('fs');
const readline = require('readline');
const path = require('path');
const { execSync } = require('child_process');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Use stealth plugin to avoid detection
puppeteer.use(StealthPlugin());

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
 * Retrieves a list of unique YouTube video IDs from a channel’s Videos page.
 * @param {string} channelUrl - The base URL of the channel (e.g., https://www.youtube.com/c/ChannelName)
 * @returns {Promise<string[]>} - Array of video IDs
 */
async function getChannelVideos(channelUrl) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  // Go to the channel's videos page
  const videosPage = channelUrl + '/videos';
  console.log(`Navigating to ${videosPage}`);
  await page.goto(videosPage, { waitUntil: 'networkidle2' });

  // Scroll to load additional videos
  let previousHeight;
  try {
    while (true) {
      previousHeight = await page.evaluate('document.documentElement.scrollHeight');
      await page.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
      await new Promise(resolve => setTimeout(resolve, 2000));
      const newHeight = await page.evaluate('document.documentElement.scrollHeight');
      if (newHeight === previousHeight) break;
    }
  } catch (error) {
    console.error("Error during scrolling:", error.message);
  }

  // Extract video IDs by looking for links matching /watch?v=
  const videoIds = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('a[href*="/watch?v="]'));
    const ids = anchors.map(anchor => {
      const match = anchor.href.match(/v=([^&]+)/);
      return match ? match[1] : null;
    });
    // Filter out duplicates and null values
    return Array.from(new Set(ids.filter(id => id)));
  });

  await browser.close();
  return videoIds;
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

    // Wait for and click the "more" button in the profile description if it exists
    const moreButtonSelector = 'tp-yt-paper-button#more';
    try {
      await page.waitForSelector(moreButtonSelector, { timeout: 5000 });
      console.log("Clicking 'more' button in profile description.");
      await page.click(moreButtonSelector);
      await page.waitForTimeout(1000); // Wait for the UI to update
    } catch (error) {
      console.warn("'More' button not found or not clickable.", error.message);
    }

    // Wait for and click the "show transcript" button
    const showTranscriptSelector = 'tp-yt-paper-button[aria-label*="Show transcript"]';
    try {
      await page.waitForSelector(showTranscriptSelector, { timeout: 5000 });
      console.log("Clicking 'show transcript' button.");
      await page.click(showTranscriptSelector);
      await page.waitForTimeout(1000); // Wait for the transcript to load
    } catch (error) {
      console.warn("'Show transcript' button not found or not clickable.", error.message);
      return null;
    }

    // Extract the transcript text from the right column
    const transcriptSelector = 'ytd-transcript-renderer';
    try {
      await page.waitForSelector(transcriptSelector, { timeout: 5000 });
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

    // Execute the youtube-transcript-api command
    const command = `python3 -c "from youtube_transcript_api import YouTubeTranscriptApi; print(YouTubeTranscriptApi.get_transcript('${videoId}'))"`;
    const result = execSync(command, { encoding: 'utf-8' });

    if (result) {
      console.log("Transcript successfully fetched.");
      return result;
    } else {
      console.log("Transcript not found.");
      return null;
    }
  } catch (error) {
    console.error(`Error fetching transcript for video ${videoId}:`, error.message);
    return null;
  }
}

/**
 * Loads the YouTube video page and extracts related video IDs from the recommendations.
 * @param {string} videoId - The video ID
 * @returns {Promise<string[]>} - Array of related video IDs
 */
async function getRelatedVideoIds(videoId) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const browser = await puppeteer.launch({ headless: true });
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
 * Prompts the user for a YouTube profile handle to start crawling.
 * The handle should be in the format @ProfileName.
 * @returns {Promise<string>} - The YouTube profile handle.
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

  // Query the user for the YouTube profile handle
  const profileHandle = await getYouTubeProfileHandle();

  // Construct the YouTube profile URL
  const baseUrl = 'https://www.youtube.com';
  const profileUrl = `${baseUrl}/${profileHandle}`;

  console.log(`Starting crawl for profile: ${profileHandle}`);

  // Get initial video IDs from the profile's Videos page
  let videoIds = await getChannelVideos(profileUrl);
  console.log(`Found ${videoIds.length} videos for the profile.`);

  // Use a set to avoid reprocessing the same videos
  const crawled = new Set();
  const queue = [...videoIds];

  // Allow crawling more videos with timeouts
  const maxVideos = 100; // Increased limit
  let count = 0;
  let currentVideoId = null;

  while (queue.length > 0 && count < maxVideos) {
    const videoId = queue.shift();
    if (crawled.has(videoId)) continue;
    crawled.add(videoId);

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`\nProcessing video: ${videoUrl}`);

    // Check if the transcript already exists
    const videoName = `Video_${videoId}`; // Replace with actual video name if retrievable
    if (doesTranscriptExist(profileHandle, videoName)) {
      console.log(`-> Transcript already exists for ${videoId}. Skipping.`);
      continue;
    }

    // Fetch the transcript from the youtube-transcript-api
    currentVideoId = videoId;
    const transcript = await getVideoTranscript(videoId);

    if (transcript) {
      const filePath = getTranscriptFilePath(profileHandle, videoName);
      console.log(`-> Transcript found for ${videoId} [saving to ${filePath}]`);
      fs.writeFileSync(filePath, transcript, 'utf8');
    } else {
      console.log("-> No transcript available.");
    }

    count++;

    // Add a delay to avoid overloading the server
    const delayTime = Math.random() * (73000 - 11000) + 11000; // Random delay between 11-73 seconds
    console.log(`Waiting for ${Math.round(delayTime / 1000)} seconds before processing the next video...`);
    await delay(delayTime);
  }

  console.log(`\nCrawling finished. Processed ${count} videos.`);
}

/**
 * Fetches related channels for a given YouTube profile handle.
 * @param {string} profileHandle - The YouTube profile handle.
 * @returns {Promise<string[]>} - An array of related channel handles.
 */
async function getRelatedChannels(profileHandle) {
  const browser = await puppeteer.launch({ headless: true });
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

// Example usage
const transcriptsDir = path.join(__dirname, 'TRANSCRIPTIONS');
const outputFilePath = path.join(__dirname, 'consolidated_transcripts.jsonl');
consolidateTranscripts(transcriptsDir, outputFilePath);

process.on('SIGINT', async () => {
  console.log('\nTermination signal received. Completing the current download before exiting...');

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

  console.log('Exiting program.');
  process.exit(0);
});

main();
