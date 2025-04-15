# RippinTubes

## Overview
The YouTube Transcript Crawler is a Node.js-based tool designed to scrape transcripts from YouTube videos. It starts with a specified YouTube profile handle, processes videos to fetch their transcripts, and saves them in a structured format in the `TRANSCRIPTIONS` directory. The program ensures no duplicate transcripts are downloaded, even if restarted.

## Features
- Fetches transcripts directly using the `youtube-transcript-api`.
- Skips videos with existing transcripts to avoid duplicates.
- Crawls related YouTube channels for additional transcripts.
- Implements random delays between requests to avoid overloading servers.
- Saves transcripts with filenames that include the video name and timestamp.

## Requirements
- Node.js (v14 or later)
- Python 3.x
- `youtube-transcript-api` Python library
- Puppeteer with stealth plugin

## Installation
1. Clone this repository:
   ```bash
   git clone https://github.com/gs-ai/RippinTubes.git
   cd RippinTubes
   ```
2. Install Node.js dependencies:
   ```bash
   npm install
   ```
3. Install Python dependencies:
   ```bash
   pip install youtube-transcript-api
   ```

## Usage
1. Run the program:
   ```bash
   node rippintubes.js
   ```
2. Enter the YouTube profile handle when prompted (e.g., `@someyoutubechannel`).
3. The program will fetch transcripts and save them in the `TRANSCRIPTIONS` directory.

## Configuration
- The program uses a random delay between 11 and 73 seconds between requests to avoid overloading servers.
- By default, it processes up to 100 videos per channel. This limit can be adjusted in the `maxVideos` variable in the code.

## Notes
- Ensure you have a valid YouTube API key set in your environment variables if using the YouTube API for additional features.
- The program skips videos without available transcripts.

## Directory Structure
```
RippinTubes/
├── rippintubes.js
├── TRANSCRIPTIONS/
```

## Additional Features
- **Related Channels Crawling**: Fetches related YouTube channels for additional transcripts.
- **Consolidation**: Consolidates all transcript files into a single JSONL file for easier processing.

## Example Usage
### Consolidating Transcripts
The program can consolidate all transcript files into a single JSONL file for easier processing. This is done automatically at the end of the script execution.

The consolidated file is saved as `consolidated_transcripts.jsonl` in the root directory.

## License
This project is licensed under the MIT License.